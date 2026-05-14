import { createTetraRuntime } from '@tetra/runtime'
import type { TetraRuntime } from '@tetra/runtime'
import { createTetraStore } from '@tetra/store'
import type { TetraStore } from '@tetra/store'
import { createOpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'

export type TetraClient = TetraStore & {
  runtime: TetraRuntime
} & Pick<TetraRuntime, 'requests' | 'sessions' | 'start' | 'stop'>

let tetraPromise: Promise<TetraClient> | null = null

/**
 * Get the Tetra singleton. Initializes on first call, returns the
 * same instance on subsequent calls. Safe to call concurrently.
 */
// oxlint-disable-next-line promise-function-async -- Singleton accessor should return the stored initialization promise directly.
export const getTetra = (): Promise<TetraClient> => {
  tetraPromise ??= initialize()
  return tetraPromise
}

async function initialize(): Promise<TetraClient> {
  const store = createTetraStore()
  const runtime = createTetraRuntime({
    store,
  })

  // OPFS persistence must load before runtime recovery.
  const root = await navigator.storage.getDirectory()
  const handle = await root.getFileHandle('tetra-runtime.json', { create: true })
  const persister = createOpfsPersister(store.store, handle)
  await persister.startAutoPersisting()

  runtime.start()

  return { ...store, ...runtime, runtime }
}
