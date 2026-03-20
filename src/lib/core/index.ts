import { createBrowserTransport } from '@/lib/core/browser-transport'
import { createDataLayer } from '@/lib/core/data'
import type { DataLayer } from '@/lib/core/data'
import type { Operations } from '@/lib/core/operations'
import { bindOperations } from '@/lib/core/operations'
import type { Runtime } from '@/lib/core/runtime'
import { startRuntime } from '@/lib/core/runtime'

export type Core = Operations & {
  data: DataLayer
  runtime: Runtime
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
  const data = createDataLayer()
  await data.initialize()

  // Late-binding ref — the UI store syncs the key here after hydration
  const apiKeyRef: { current: string | undefined } = { current: undefined }
  const transport = createBrowserTransport(() => apiKeyRef.current)

  const operations = bindOperations(data)
  const runtime = startRuntime(data, transport)

  return {
    ...operations,
    data,
    runtime,
    setApiKey: (key) => {
      apiKeyRef.current = key
    },
  }
}
