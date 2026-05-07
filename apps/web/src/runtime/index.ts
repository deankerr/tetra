import { createInferenceRuntime } from '@tetra/inference-runtime'
import type { InferenceRuntime } from '@tetra/inference-runtime'
import { createTetraStore } from '@tetra/store'
import type { TetraStore } from '@tetra/store'
import { createOpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'

import { getOpenRouterApiKey } from '@/local-store/local-secrets'

export type TetraClient = TetraStore & {
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
  const tetra = createTetraStore()
  const inference = createInferenceRuntime({
    getOpenRouterApiKey,
    tetra,
  })

  // OPFS persistence — must complete before engine starts
  const root = await navigator.storage.getDirectory()
  const handle = await root.getFileHandle('tetra-runtime.json', { create: true })
  const persister = createOpfsPersister(tetra.tinybase.store, handle)
  await persister.startAutoPersisting()

  // Start engine after persistence is loaded
  inference.start()

  return { ...tetra, inference }
}
