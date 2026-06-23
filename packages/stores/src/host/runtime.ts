import { createTinyBaseProviderProps } from './definition.ts'
import type { AnyStoreDefinition } from './definition.ts'

export interface RuntimePersister {
  destroy(): Promise<unknown>
  getStore(): unknown
  load(): Promise<unknown>
  save(): Promise<unknown>
  startAutoLoad(): Promise<unknown>
  startAutoSave(): Promise<unknown>
}

export interface RuntimeSynchronizer {
  destroy(): Promise<unknown>
  startSync(): Promise<unknown>
}

export interface RuntimeStoreInstance {
  definition: Pick<
    AnyStoreDefinition,
    'id' | 'indexesId' | 'persisterId' | 'storeId' | 'synchronizerId'
  >
  id: string
  isMergeable: boolean
  rawIndexes: unknown
  rawStore: unknown
}

export type RuntimeStoreHost = Record<string, RuntimeStoreInstance>

export interface StoreRuntime<
  Host extends RuntimeStoreHost,
  Persister extends RuntimePersister = RuntimePersister,
  Synchronizer extends RuntimeSynchronizer = RuntimeSynchronizer,
> {
  close(): Promise<void>
  host: Host
  persistersById: Record<string, Persister>
  providerProps: {
    indexesById: Record<string, unknown>
    persistersById: Record<string, Persister>
    storesById: Record<string, unknown>
    synchronizersById: Record<string, Synchronizer>
  }
  synchronizersById: Record<string, Synchronizer>
}

export function createStoreRuntime<
  Host extends RuntimeStoreHost,
  Persister extends RuntimePersister = RuntimePersister,
  Synchronizer extends RuntimeSynchronizer = RuntimeSynchronizer,
>(args: {
  close: () => Promise<void>
  host: Host
  persistersById: Record<string, Persister>
  synchronizersById: Record<string, Synchronizer>
}): StoreRuntime<Host, Persister, Synchronizer> {
  return {
    ...args,
    providerProps: {
      ...createTinyBaseProviderProps(args.host),
      persistersById: args.persistersById,
      synchronizersById: args.synchronizersById,
    },
  }
}

export function requireStoreInstance(
  host: RuntimeStoreHost,
  storeId: string,
): RuntimeStoreInstance {
  const instance = host[storeId]
  if (instance === undefined) {
    throw new Error(`Missing store instance: ${storeId}`)
  }

  return instance
}
