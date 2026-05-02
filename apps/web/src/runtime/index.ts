import { createInferenceRuntime } from '@tetra/inference-runtime'
import type { InferenceRuntime } from '@tetra/inference-runtime'
import { createTetraStore } from '@tetra/store'
import type { TetraStore } from '@tetra/store'
import { createOpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'

import { getOpenRouterApiKey } from '@/local-store/local-secrets'

const EXECUTOR_ID_KEY = 'tetra-runtime-id'
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

// --- Store + Executor ---

/** Stable executor ID for this browser — persisted so stale recovery works across restarts. */
function getOrCreateExecutorId(): string {
  const existing = localStorage.getItem(EXECUTOR_ID_KEY)
  if (existing !== null) {
    return existing
  }
  const id = crypto.randomUUID()
  localStorage.setItem(EXECUTOR_ID_KEY, id)
  return id
}

export type TetraClient = TetraStore & {
  executorId: string
  inference: InferenceRuntime
}

let tetraPromise: Promise<TetraClient> | null = null

/**
 * Get the Tetra singleton. Initializes on first call, returns the
 * same instance on subsequent calls. Safe to call concurrently.
 */
// oxlint-disable-next-line typescript/promise-function-async -- This is a singleton promise accessor; making it async adds no value and conflicts with require-await.
export const getTetra = (): Promise<TetraClient> => {
  tetraPromise ??= initialize()
  return tetraPromise
}

async function initialize(): Promise<TetraClient> {
  const executorId = getOrCreateExecutorId()
  const tetra = createTetraStore()
  const inference = createInferenceRuntime({
    executorId,
    getOpenRouterApiKey,
    tetra,
  })

  // OPFS persistence — must complete before engine starts
  const root = await navigator.storage.getDirectory()
  const handle = await root.getFileHandle('tetra-runtime.json', { create: true })
  const persister = createOpfsPersister(tetra.tinybase.store, handle)
  await persister.startAutoPersisting()

  // Sync to server (best-effort, non-blocking)
  try {
    const ws = new WebSocket(SYNC_URL)
    const synchronizer = await createWsSynchronizer(tetra.tinybase.store, ws)

    // TinyBase resolves the synchronizer after an initial socket error, so
    // guard before enabling auto-sync against a socket that is already closed.
    if (ws.readyState !== WebSocket.OPEN) {
      await synchronizer.destroy()
      setSyncStatus('off')
      console.warn('[runtime] sync unavailable, running local-only')
      inference.start()
      return { ...tetra, executorId, inference }
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
  inference.start()

  return { ...tetra, executorId, inference }
}
