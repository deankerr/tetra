import type { Runtime } from '@tetra/runtime'
import { createRuntime } from '@tetra/runtime'
import { createOpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'

import { getOpenRouterApiKey } from '@/lib/local-secrets'

const RUNTIME_ID_KEY = 'tetra-runtime-id'
const SYNC_URL = 'ws://localhost:8048'

// --- Sync Status ---

export type SyncStatus = 'connected' | 'disconnected' | 'off'

type SyncStatusListener = (status: SyncStatus) => void

let currentSyncStatus: SyncStatus = 'off'
const syncStatusListeners = new Set<SyncStatusListener>()

function setSyncStatus(status: SyncStatus) {
  currentSyncStatus = status
  for (const listener of syncStatusListeners) {
    listener(status)
  }
}

export function getSyncStatus(): SyncStatus {
  return currentSyncStatus
}

export function subscribeSyncStatus(listener: SyncStatusListener): () => void {
  syncStatusListeners.add(listener)
  return () => syncStatusListeners.delete(listener)
}

// --- Runtime ---

/** Stable runtime ID for this browser — persisted so stale recovery works across restarts. */
function getOrCreateRuntimeId(): string {
  const existing = localStorage.getItem(RUNTIME_ID_KEY)
  if (existing !== null) {
    return existing
  }
  const id = crypto.randomUUID()
  localStorage.setItem(RUNTIME_ID_KEY, id)
  return id
}

export type { Runtime }

let runtimePromise: Promise<Runtime> | null = null

/**
 * Get the Runtime singleton. Initializes on first call, returns the
 * same instance on subsequent calls. Safe to call concurrently.
 */
// oxlint-disable-next-line typescript/promise-function-async -- This is a singleton promise accessor; making it async adds no value and conflicts with require-await.
export const getRuntime = (): Promise<Runtime> => {
  runtimePromise ??= initialize()
  return runtimePromise
}

async function initialize(): Promise<Runtime> {
  const runtime = createRuntime({
    getOpenRouterApiKey,
    runtimeId: getOrCreateRuntimeId(),
  })

  // OPFS persistence — must complete before engine starts
  const root = await navigator.storage.getDirectory()
  const handle = await root.getFileHandle('tetra-runtime.json', { create: true })
  const persister = createOpfsPersister(runtime.store, handle)
  await persister.startAutoPersisting()

  // Sync to server (best-effort, non-blocking)
  try {
    const ws = new WebSocket(SYNC_URL)
    const synchronizer = await createWsSynchronizer(runtime.store, ws)

    // TinyBase resolves the synchronizer after an initial socket error, so
    // guard before enabling auto-sync against a socket that is already closed.
    if (ws.readyState !== WebSocket.OPEN) {
      await synchronizer.destroy()
      setSyncStatus('off')
      console.warn('[runtime] sync unavailable, running local-only')
      runtime.start()
      return runtime
    }

    await synchronizer.startSync()
    setSyncStatus('connected')
    console.log('[runtime] sync connected', SYNC_URL)

    // Tear down TinyBase auto-sync when the socket closes so later local
    // writes, especially streamed chunks, do not send into a closed socket.
    ws.addEventListener('close', () => {
      setSyncStatus('disconnected')
      void synchronizer.destroy()
      console.warn('[runtime] sync disconnected')
    })
  } catch (error: unknown) {
    setSyncStatus('off')
    console.warn('[runtime] sync unavailable, running local-only', error)
  }

  // Start engine after persistence is loaded
  runtime.start()

  return runtime
}
