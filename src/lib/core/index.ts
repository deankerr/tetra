import { createBrowserTransport } from '@/lib/core/browser-transport'
import { createDataLayer } from '@/lib/core/data'
import type { DataLayer } from '@/lib/core/data'
import { generateId } from '@/lib/core/id'
import type { Operations } from '@/lib/core/operations'
import { bindOperations } from '@/lib/core/operations'
import type { Runtime } from '@/lib/core/runtime'
import { startRuntime } from '@/lib/core/runtime'

const RUNTIME_ID_KEY = 'tetra-runtime-id'

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

  const data = createDataLayer()
  await data.initialize()

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
