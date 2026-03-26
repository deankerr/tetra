import type { AppStore, DataLayer, Operations, Runtime } from '@tetra/runtime'
import {
  bindOperations,
  createAppIndexes,
  createAppStore,
  createDataLayer,
  generateId,
  startRuntime,
} from '@tetra/runtime'
import { createOpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'

import { createBrowserTransport } from '@/lib/core/browser-transport'

const RUNTIME_ID_KEY = 'tetra-runtime-id'
const SYNC_URL = 'ws://localhost:8048'

/** Stable runtime ID for this browser — persisted so stale recovery works across restarts. */
function getOrCreateRuntimeId(): string {
  const existing = localStorage.getItem(RUNTIME_ID_KEY)
  if (existing !== null) {
    return existing
  }
  const id = generateId.runtime()
  localStorage.setItem(RUNTIME_ID_KEY, id)
  return id
}

async function startPersistence(store: AppStore) {
  const root = await navigator.storage.getDirectory()
  const handle = await root.getFileHandle('tetra-core.json', { create: true })
  const persister = createOpfsPersister(store, handle)
  await persister.startAutoPersisting()
}

async function startSync(store: AppStore) {
  try {
    const ws = new WebSocket(SYNC_URL)
    const synchronizer = await createWsSynchronizer(store, ws)
    await synchronizer.startSync()
    console.log('[core] sync connected', SYNC_URL)
  } catch (error: unknown) {
    console.warn('[core] sync unavailable, running local-only', error)
  }
}

export type Core = Operations & {
  data: DataLayer
  runtime: Runtime
  runtimeId: string
  setApiKey: (key: string | undefined) => void
}

let corePromise: Promise<Core> | null = null

/**
 * Get the Core singleton. Initializes on first call, returns the
 * same instance on subsequent calls. Safe to call concurrently.
 */
// oxlint-disable-next-line typescript/promise-function-async -- This is a singleton promise accessor; making it async adds no value and conflicts with require-await.
export const getCore = (): Promise<Core> => {
  corePromise ??= initialize()
  return corePromise
}

async function initialize(): Promise<Core> {
  const runtimeId = getOrCreateRuntimeId()

  // Store and indexes — schema definitions, environment-agnostic
  const store = createAppStore()
  const indexes = createAppIndexes(store)

  // Browser persistence (OPFS) — must complete before runtime starts
  await startPersistence(store)

  // Sync to server (best-effort, non-blocking)
  void startSync(store)

  // Data layer — pure DAOs over the store
  const data = createDataLayer(store, indexes)

  // Late-binding ref — the UI store syncs the key here after hydration
  const apiKeyRef: { current: string | undefined } = { current: undefined }
  const transport = createBrowserTransport(() => apiKeyRef.current)

  const operations = bindOperations(data, runtimeId)
  const runtime = startRuntime(data, transport, runtimeId)

  return {
    ...operations,
    data,
    runtime,
    runtimeId,
    setApiKey: (key) => {
      apiKeyRef.current = key
    },
  }
}
