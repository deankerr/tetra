import type { StoreSchemasFor } from '@tetra/tinybase-schema'
import type { Persister, Persists } from 'tinybase/persisters/with-schemas'

import { createStoreHost } from './host/definition.ts'
import { libraryStoreDefinition } from './library/index.ts'

// oxlint-disable no-unsafe-type-assertion -- The Worker passes Cloudflare SQL storage through to TinyBase's Durable Object persister.

const workerStoreDefinitions = [libraryStoreDefinition] as const
export type WorkerStores = ReturnType<typeof createWorkerStores>
export type WorkerStoreSchemas = StoreSchemasFor<(typeof libraryStoreDefinition)['schema']>
export type WorkerRuntimePersister = Persister<WorkerStoreSchemas, Persists.MergeableStoreOnly>

interface WorkerStoreRuntimeOptions {
  createDurableObjectSqlStoragePersister?: (
    library: WorkerStores['library'],
    sqlStorage: unknown,
  ) => Promise<WorkerRuntimePersister> | WorkerRuntimePersister
  sqlStorage: unknown
}

export interface WorkerStoreRuntime {
  close(): Promise<void>
  host: WorkerStores
  libraryPersister: WorkerRuntimePersister
}

export function createWorkerStores() {
  // The sync server hosts only the shared library store, and it must be mergeable.
  return createStoreHost(workerStoreDefinitions, {
    mergeableStoreIds: [libraryStoreDefinition.id],
  })
}

export async function createWorkerStoreRuntime(
  options: WorkerStoreRuntimeOptions,
): Promise<WorkerStoreRuntime> {
  const host = createWorkerStores()
  const createDurableObjectSqlStoragePersister =
    options.createDurableObjectSqlStoragePersister ?? createDefaultDurableObjectSqlStoragePersister
  const libraryPersister = await createDurableObjectSqlStoragePersister(
    host.library,
    options.sqlStorage,
  )

  let closed = false
  return {
    async close() {
      if (closed) {
        return
      }
      closed = true
      await libraryPersister.destroy()
    },
    host,
    libraryPersister,
  }
}

async function createDefaultDurableObjectSqlStoragePersister(
  library: WorkerStores['library'],
  sqlStorage: unknown,
): Promise<WorkerRuntimePersister> {
  const { createDurableObjectSqlStoragePersister } =
    await import('tinybase/persisters/persister-durable-object-sql-storage/with-schemas')
  return createDurableObjectSqlStoragePersister(library.rawStore as never, sqlStorage as never)
}
