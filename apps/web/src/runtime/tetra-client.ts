import { createTetraRuntime } from '@tetra/runtime'
import type { TetraRuntime } from '@tetra/runtime'
import { createTetraStore } from '@tetra/store'
import type { Schemas, TetraStore } from '@tetra/store'
import type { OpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import { createOpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'

export interface TetraApp {
  indexes: TetraStore['indexes']
  persister: OpfsPersister<Schemas>
  runtime: TetraRuntime
  store: TetraStore['store']
}

let tetraPromise: Promise<TetraApp> | null = null

/**
 * Get the Tetra singleton. Initializes on first call, returns the
 * same instance on subsequent calls. Safe to call concurrently.
 */
// oxlint-disable-next-line promise-function-async -- Singleton accessor should return the stored initialization promise directly.
export const getTetra = (): Promise<TetraApp> => {
  tetraPromise ??= initialize()
  return tetraPromise
}

async function initialize(): Promise<TetraApp> {
  const tetraStore = createTetraStore()
  const runtime = createTetraRuntime({
    store: tetraStore,
  })

  // OPFS persistence must load before runtime recovery.
  const root = await navigator.storage.getDirectory()
  const handle = await root.getFileHandle('tetra-runtime.json', { create: true })
  const persister = createOpfsPersister(tetraStore.store, handle)
  await persister.startAutoPersisting()

  runtime.recoverInterruptedRequests()

  return {
    indexes: tetraStore.indexes,
    persister,
    runtime,
    store: tetraStore.store,
  }
}
