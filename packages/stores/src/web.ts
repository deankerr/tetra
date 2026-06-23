import { catalogStoreDefinition } from './catalog/index.ts'
import { createStoreHost } from './host/definition.ts'
import type { StoreLifecyclePlan } from './host/lifecycle.ts'
import { createStoreRuntime, requireStoreInstance } from './host/runtime.ts'
import type {
  RuntimePersister,
  RuntimeStoreInstance,
  RuntimeSynchronizer,
  StoreRuntime,
} from './host/runtime.ts'
import { libraryStoreDefinition } from './library/index.ts'
import { webStoreDefinition } from './web/index.ts'

// oxlint-disable no-unsafe-type-assertion -- Platform factories are the typed boundary between generic store hosts and TinyBase runtime modules.

export type WebDataMode = 'persist' | 'sync'

export { catalogStoreDefinition, catalogStoreSchema } from './catalog/index.ts'
export type { CatalogRows, CatalogTypedStore } from './catalog/index.ts'
export { createTinyBaseProviderProps } from './host/definition.ts'
export type { RuntimePersister, RuntimeSynchronizer } from './host/runtime.ts'
export {
  libraryIndexIds,
  libraryStoreDefinition,
  libraryStoreSchema,
  ProviderOptionsSchema,
  RunConfigSchema,
  RunConfigSnapshotSchema,
  SessionRunConfigSchema,
  StepWarningSchema,
} from './library/index.ts'
export type {
  LibraryRows,
  LibraryRunStatus,
  LibraryTypedIndexes,
  LibraryTypedStore,
  RunConfig,
} from './library/index.ts'
export { webStoreDefinition, webStoreSchema } from './web/index.ts'
export type { WebRows, WebTypedStore } from './web/index.ts'

export const WEB_CATALOG_INDEXED_DB_NAME = 'tetra-catalog'
export const WEB_LIBRARY_INDEXED_DB_NAME = 'tetra-library'

const webStoreDefinitions = [
  libraryStoreDefinition,
  catalogStoreDefinition,
  webStoreDefinition,
] as const

export type WebStoreHost = ReturnType<typeof createWebStoreHost>

export interface WebStoreHostOptions {
  createIndexedDbPersister?: (
    instance: RuntimeStoreInstance,
    databaseName: string,
  ) => Promise<RuntimePersister> | RuntimePersister
  createWebSocket?: (url: string) => unknown
  createWsSynchronizer?: (
    instance: RuntimeStoreInstance,
    webSocket: unknown,
  ) => Promise<RuntimeSynchronizer> | RuntimeSynchronizer
  syncUrl: string
}

export function createWebStoreHost(mode: WebDataMode) {
  // Only the synced library store needs a MergeableStore in the web app.
  return createStoreHost(webStoreDefinitions, {
    mergeableStoreIds: mode === 'sync' ? [libraryStoreDefinition.id] : [],
  })
}

export function getWebLifecyclePlans(mode: WebDataMode, syncUrl: string): StoreLifecyclePlan[] {
  return [
    {
      persistence:
        mode === 'persist'
          ? {
              databaseName: WEB_LIBRARY_INDEXED_DB_NAME,
              kind: 'indexed-db',
            }
          : undefined,
      storeId: libraryStoreDefinition.id,
      sync: mode === 'sync' ? { kind: 'websocket', url: syncUrl } : undefined,
    },
    {
      persistence: {
        databaseName: WEB_CATALOG_INDEXED_DB_NAME,
        kind: 'indexed-db',
      },
      storeId: catalogStoreDefinition.id,
    },
    {
      storeId: webStoreDefinition.id,
    },
  ]
}

export async function startWebStoreHost(
  mode: WebDataMode,
  options: WebStoreHostOptions,
): Promise<StoreRuntime<WebStoreHost>> {
  const host = createWebStoreHost(mode)
  const persistersById: Record<string, RuntimePersister> = {}
  const synchronizersById: Record<string, RuntimeSynchronizer> = {}
  const createIndexedDbPersister =
    options.createIndexedDbPersister ?? createDefaultIndexedDbPersister
  const createWebSocket = options.createWebSocket ?? createDefaultWebSocket
  const createWsSynchronizer = options.createWsSynchronizer ?? createDefaultWsSynchronizer

  // Lifecycle plans stay descriptive; this function is where platform objects are created.
  for (const plan of getWebLifecyclePlans(mode, options.syncUrl)) {
    const instance = requireStoreInstance(host, plan.storeId)
    if (plan.persistence?.kind === 'indexed-db') {
      const persister = await createIndexedDbPersister(instance, plan.persistence.databaseName)
      await persister.startAutoLoad()
      await persister.startAutoSave()
      persistersById[instance.definition.persisterId] = persister
    }
    if (plan.persistence?.kind === 'sqlite' || plan.persistence?.kind === 'durable-object-sql') {
      throw new Error(`Unsupported web persistence: ${plan.persistence.kind}`)
    }
    if (plan.sync?.kind === 'websocket') {
      assertMergeableStore(instance)
      const webSocket = createWebSocket(plan.sync.url)
      const synchronizer = await createWsSynchronizer(instance, webSocket)
      await synchronizer.startSync()
      synchronizersById[instance.definition.synchronizerId] = synchronizer
    }
  }

  let closed = false
  return createStoreRuntime({
    async close() {
      if (closed) {
        return
      }
      closed = true

      // Stop background sync before taking one final persistence snapshot.
      for (const synchronizer of Object.values(synchronizersById)) {
        await synchronizer.destroy()
      }
      for (const persister of Object.values(persistersById)) {
        await persister.save()
        await persister.destroy()
      }
    },
    host,
    persistersById,
    synchronizersById,
  })
}

export async function createWebIndexedDbPersister(
  instance: RuntimeStoreInstance,
  databaseName: string,
): Promise<RuntimePersister> {
  const { createIndexedDbPersister } =
    await import('tinybase/persisters/persister-indexed-db/with-schemas')
  return createIndexedDbPersister(instance.rawStore as never, databaseName) as RuntimePersister
}

export function createWebSocketClient(url: string): WebSocket {
  return new WebSocket(url)
}

export async function createWebWsSynchronizer(
  instance: RuntimeStoreInstance,
  webSocket: unknown,
): Promise<RuntimeSynchronizer> {
  assertMergeableStore(instance)
  const { createWsSynchronizer } =
    await import('tinybase/synchronizers/synchronizer-ws-client/with-schemas')
  return (await createWsSynchronizer(
    instance.rawStore as never,
    webSocket as never,
  )) as RuntimeSynchronizer
}

export function assertMergeableStore(instance: RuntimeStoreInstance): void {
  if (!instance.isMergeable) {
    throw new Error(`Store is not mergeable: ${instance.id}`)
  }
}

const createDefaultIndexedDbPersister = createWebIndexedDbPersister
const createDefaultWebSocket = createWebSocketClient
const createDefaultWsSynchronizer = createWebWsSynchronizer
