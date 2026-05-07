import { createInference } from '@tetra/inference'
import { createTetraRuntime } from '@tetra/runtime'
import type { TetraRuntime } from '@tetra/runtime'
import { createTetraStore } from '@tetra/store'
import type { TetraStore } from '@tetra/store'
import { createOpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'

import { getOpenRouterApiKey } from '@/local-store/local-secrets'

export type TetraClient = TetraStore & {
  runtime: TetraRuntime
} & Pick<TetraRuntime, 'commands' | 'start' | 'stop'>

let tetraPromise: Promise<TetraClient> | null = null

/**
 * Get the Tetra singleton. Initializes on first call, returns the
 * same instance on subsequent calls. Safe to call concurrently.
 */
export const getTetra = async (): Promise<TetraClient> => {
  tetraPromise ??= initialize()
  return tetraPromise
}

async function initialize(): Promise<TetraClient> {
  const store = createTetraStore()
  const inference = createInference({
    getOpenRouterApiKey,
  })
  const runtime = createTetraRuntime({
    inference,
    store,
  })

  // OPFS persistence must load before runtime recovery.
  const root = await navigator.storage.getDirectory()
  const handle = await root.getFileHandle('tetra-runtime.json', { create: true })
  const persister = createOpfsPersister(store.tinybase.store, handle)
  await persister.startAutoPersisting()

  runtime.start()

  return { ...store, ...runtime, runtime }
}
