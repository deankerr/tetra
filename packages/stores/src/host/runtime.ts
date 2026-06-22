import { createTinyBaseProviderProps } from './definition.ts'
import type { AnyStoreDefinition } from './definition.ts'

export interface RuntimePersister {
  destroy(): Promise<unknown>
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

export interface StoreRuntime<Host extends RuntimeStoreHost> {
  close(): Promise<void>
  host: Host
  persistersById: Record<string, RuntimePersister>
  providerProps: {
    indexesById: Record<string, unknown>
    persistersById: Record<string, RuntimePersister>
    storesById: Record<string, unknown>
    synchronizersById: Record<string, RuntimeSynchronizer>
  }
  synchronizersById: Record<string, RuntimeSynchronizer>
}

export function createStoreRuntime<Host extends RuntimeStoreHost>(args: {
  close: () => Promise<void>
  host: Host
  persistersById: Record<string, RuntimePersister>
  synchronizersById: Record<string, RuntimeSynchronizer>
}): StoreRuntime<Host> {
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
