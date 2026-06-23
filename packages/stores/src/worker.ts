import type { StoreSchemasFor } from '@tetra/tinybase-schema'
import type { Persister, Persists } from 'tinybase/persisters/with-schemas'

import { createStoreHost } from './host/definition.ts'
import type { StoreLifecyclePlan } from './host/lifecycle.ts'
import { createStoreRuntime, requireStoreInstance } from './host/runtime.ts'
import type { RuntimeStoreInstance, StoreRuntime } from './host/runtime.ts'
import { libraryStoreDefinition } from './library/index.ts'

// oxlint-disable no-unsafe-type-assertion -- The Worker passes Cloudflare SQL storage through to TinyBase's Durable Object persister.

const workerStoreDefinitions = [libraryStoreDefinition] as const
export type WorkerStoreSchemas = StoreSchemasFor<(typeof libraryStoreDefinition)['schema']>
export type WorkerRuntimePersister = Persister<WorkerStoreSchemas, Persists.MergeableStoreOnly>

export interface WorkerStoreHostOptions {
  createDurableObjectSqlStoragePersister?: (
    instance: RuntimeStoreInstance,
    sqlStorage: unknown,
  ) => Promise<WorkerRuntimePersister> | WorkerRuntimePersister
  sqlStorage: unknown
}

export type WorkerStoreHost = ReturnType<typeof createWorkerStoreHost>

export function createWorkerStoreHost() {
  // The sync server only hosts the shared library store.
  return createStoreHost(workerStoreDefinitions, {
    mergeableStoreIds: [libraryStoreDefinition.id],
  })
}

export function getWorkerLifecyclePlans(): StoreLifecyclePlan[] {
  return [
    {
      persistence: {
        kind: 'durable-object-sql',
      },
      storeId: libraryStoreDefinition.id,
    },
  ]
}

export async function createWorkerStoreRuntime(
  options: WorkerStoreHostOptions,
): Promise<StoreRuntime<WorkerStoreHost, WorkerRuntimePersister>> {
  const host = createWorkerStoreHost()
  const persistersById: Record<string, WorkerRuntimePersister> = {}
  const createDurableObjectSqlStoragePersister =
    options.createDurableObjectSqlStoragePersister ?? createDefaultDurableObjectSqlStoragePersister

  // WsServerDurableObject owns load/startAutoSave/startSync after it receives this persister.
  for (const plan of getWorkerLifecyclePlans()) {
    const instance = requireStoreInstance(host, plan.storeId)
    if (plan.persistence?.kind !== 'durable-object-sql') {
      throw new Error(`Unsupported Worker persistence: ${plan.persistence?.kind ?? 'none'}`)
    }
    const persister = await createDurableObjectSqlStoragePersister(instance, options.sqlStorage)
    persistersById[instance.definition.persisterId] = persister
  }

  let closed = false
  return createStoreRuntime({
    async close() {
      if (closed) {
        return
      }
      closed = true

      for (const persister of Object.values(persistersById)) {
        await persister.destroy()
      }
    },
    host,
    persistersById,
    synchronizersById: {},
  })
}

async function createDefaultDurableObjectSqlStoragePersister(
  instance: RuntimeStoreInstance,
  sqlStorage: unknown,
): Promise<WorkerRuntimePersister> {
  const { createDurableObjectSqlStoragePersister } =
    await import('tinybase/persisters/persister-durable-object-sql-storage/with-schemas')
  return createDurableObjectSqlStoragePersister(instance.rawStore as never, sqlStorage as never)
}
