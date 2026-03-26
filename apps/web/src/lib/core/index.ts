import type { Runtime } from '@tetra/runtime'
import { createRuntime } from '@tetra/runtime'
import { createOpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'

const RUNTIME_ID_KEY = 'tetra-runtime-id'
const SYNC_URL = 'ws://localhost:8048'

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

export type { Runtime as Core }

let corePromise: Promise<Runtime> | null = null

/**
 * Get the Core singleton. Initializes on first call, returns the
 * same instance on subsequent calls. Safe to call concurrently.
 */
// oxlint-disable-next-line typescript/promise-function-async -- This is a singleton promise accessor; making it async adds no value and conflicts with require-await.
export const getCore = (): Promise<Runtime> => {
  corePromise ??= initialize()
  return corePromise
}

async function initialize(): Promise<Runtime> {
  const runtime = createRuntime({ runtimeId: getOrCreateRuntimeId() })

  // OPFS persistence — must complete before engine starts
  const root = await navigator.storage.getDirectory()
  const handle = await root.getFileHandle('tetra-core.json', { create: true })
  const persister = createOpfsPersister(runtime.store, handle)
  await persister.startAutoPersisting()

  // Sync to server (best-effort, non-blocking)
  try {
    const ws = new WebSocket(SYNC_URL)
    const synchronizer = await createWsSynchronizer(runtime.store, ws)
    await synchronizer.startSync()
    console.log('[core] sync connected', SYNC_URL)
  } catch (error: unknown) {
    console.warn('[core] sync unavailable, running local-only', error)
  }

  // Start engine after persistence is loaded
  runtime.start()

  return runtime
}
