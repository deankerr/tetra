import { catalogStoreDefinition } from './catalog/index.ts'
import { cliStoreDefinition } from './cli/index.ts'
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

// oxlint-disable no-unsafe-type-assertion -- Platform factories are the typed boundary between generic store hosts and TinyBase runtime modules.

export type CliDataMode = 'local' | 'sync'

const CLI_LIBRARY_SQLITE_PATH = './tetra-library.db'
const CLI_LIBRARY_SYNC_CACHE_SQLITE_PATH = './tetra-library-sync-cache.db'
const CLI_CATALOG_SQLITE_PATH = './tetra-catalog.db'
const CLI_STATE_SQLITE_PATH = './tetra-cli.db'

const cliStoreDefinitions = [
  libraryStoreDefinition,
  catalogStoreDefinition,
  cliStoreDefinition,
] as const

export interface CliDatabase {
  close(): void
}

export type CliStoreHost = ReturnType<typeof createCliStoreHost>

export interface CliStoreHostOptions {
  createDatabase?: (path: string) => CliDatabase | Promise<CliDatabase>
  createSqlitePersister?: (
    instance: RuntimeStoreInstance,
    database: CliDatabase,
  ) => Promise<RuntimePersister> | RuntimePersister
  createWebSocket?: (url: string) => unknown
  createWsSynchronizer?: (
    instance: RuntimeStoreInstance,
    webSocket: unknown,
  ) => Promise<RuntimeSynchronizer> | RuntimeSynchronizer
  syncUrl: string
}

export function createCliStoreHost(mode: CliDataMode) {
  // CLI sync mode mirrors the current MergeableStore library cache; CLI-local state stays plain.
  return createStoreHost(cliStoreDefinitions, {
    mergeableStoreIds: mode === 'sync' ? [libraryStoreDefinition.id] : [],
  })
}

export function getCliLifecyclePlans(mode: CliDataMode, syncUrl: string): StoreLifecyclePlan[] {
  return [
    {
      persistence: {
        kind: 'sqlite',
        path: mode === 'sync' ? CLI_LIBRARY_SYNC_CACHE_SQLITE_PATH : CLI_LIBRARY_SQLITE_PATH,
      },
      storeId: libraryStoreDefinition.id,
      sync: mode === 'sync' ? { kind: 'websocket', url: syncUrl } : undefined,
    },
    {
      persistence: {
        kind: 'sqlite',
        path: CLI_CATALOG_SQLITE_PATH,
      },
      storeId: catalogStoreDefinition.id,
    },
    {
      persistence: {
        kind: 'sqlite',
        path: CLI_STATE_SQLITE_PATH,
      },
      storeId: cliStoreDefinition.id,
    },
  ]
}

export async function startCliStoreHost(
  mode: CliDataMode,
  options: CliStoreHostOptions,
): Promise<StoreRuntime<CliStoreHost>> {
  const host = createCliStoreHost(mode)
  const databasesByPersisterId: Record<string, CliDatabase> = {}
  const persistersById: Record<string, RuntimePersister> = {}
  const synchronizersById: Record<string, RuntimeSynchronizer> = {}
  const createDatabase = options.createDatabase ?? createDefaultDatabase
  const createSqlitePersister = options.createSqlitePersister ?? createDefaultSqlitePersister
  const createWebSocket = options.createWebSocket ?? createDefaultWebSocket
  const createWsSynchronizer = options.createWsSynchronizer ?? createDefaultWsSynchronizer

  // SQLite is loaded before any sync starts so the local cache participates in the first merge.
  for (const plan of getCliLifecyclePlans(mode, options.syncUrl)) {
    const instance = requireStoreInstance(host, plan.storeId)
    if (plan.persistence?.kind === 'sqlite') {
      const database = await createDatabase(plan.persistence.path)
      const persister = await createSqlitePersister(instance, database)
      await persister.load()
      databasesByPersisterId[instance.definition.persisterId] = database
      persistersById[instance.definition.persisterId] = persister
    }
    if (
      plan.persistence?.kind === 'indexed-db' ||
      plan.persistence?.kind === 'durable-object-sql'
    ) {
      throw new Error(`Unsupported CLI persistence: ${plan.persistence.kind}`)
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
      for (const [persisterId, persister] of Object.entries(persistersById)) {
        await persister.save()
        await persister.destroy()
        databasesByPersisterId[persisterId]?.close()
      }
    },
    host,
    persistersById,
    synchronizersById,
  })
}

async function createDefaultDatabase(path: string): Promise<CliDatabase> {
  const { Database } = await import('bun:sqlite')
  return new Database(path)
}

async function createDefaultSqlitePersister(
  instance: RuntimeStoreInstance,
  database: CliDatabase,
): Promise<RuntimePersister> {
  const { createSqliteBunPersister } =
    await import('tinybase/persisters/persister-sqlite-bun/with-schemas')
  return createSqliteBunPersister(instance.rawStore as never, database as never) as RuntimePersister
}

function createDefaultWebSocket(url: string): WebSocket {
  return new WebSocket(url)
}

async function createDefaultWsSynchronizer(
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

function assertMergeableStore(instance: RuntimeStoreInstance): void {
  if (!instance.isMergeable) {
    throw new Error(`Store is not mergeable: ${instance.id}`)
  }
}
