import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { catalogStoreDefinition } from '@tetra/stores/catalog'
import { libraryStoreDefinition } from '@tetra/stores/library'
import { defineTypedStore } from '@tetra/tinybase-schema'
import {
  createMergeableStoreInstance,
  createStoreInstance,
  defineStoreDefinition,
} from '@tetra/tinybase-schema/runtime'
import { createSqliteBunPersister } from 'tinybase/persisters/persister-sqlite-bun/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'
import { z } from 'zod'

// oxlint-disable-next-line typescript/strict-boolean-expressions -- Empty DATABASE_PATH should use the default database file.
const DATABASE_PATH = process.env.DATABASE_PATH?.trim() ?? 'tetra.db'
const CATALOG_TABLE_NAME = 'catalog'
const CLI_TABLE_NAME = 'cli'
const LIBRARY_TABLE_NAME = 'library'
const SYNC_REQUEST_TIMEOUT_SECONDS = 5
const SYNC_TIMEOUT_MS = 10_000

const cliStoreSchema = defineTypedStore({
  tables: {},
  values: {
    activeSessionId: z.string().nullable().default(null),
  },
})

const cliStoreDefinition = defineStoreDefinition({
  id: 'cli',
  indexIds: [],
  schema: cliStoreSchema,
})

export type CliStoreInstances = ReturnType<typeof createCliStoreInstances>
type LibraryRawStore = CliStoreInstances['library']['rawStore']

export interface CliStoreRuntimeOptions {
  syncEnabled?: boolean
}

// The runtime only ever fires these at the start/stop boundary and ignores the outcome.
interface LibrarySynchronizer {
  destroy(): Promise<void>
  load(): Promise<void>
  save(): Promise<void>
}

function createCliStoreInstances() {
  // The shared library is mergeable so SQLite cache and remote sync speak one shape.
  return {
    catalog: createStoreInstance(catalogStoreDefinition),
    cli: createStoreInstance(cliStoreDefinition),
    library: createMergeableStoreInstance(libraryStoreDefinition),
  }
}

export async function createCliStoreRuntime(options: CliStoreRuntimeOptions = {}) {
  const stores = createCliStoreInstances()
  const catalogStore = stores.catalog.rawStore
  const cliStore = stores.cli.rawStore
  const libraryStore = stores.library.rawStore

  // The CLI keeps all local stores in one SQLite database, with one JSON table per store.
  mkdirSync(dirname(DATABASE_PATH), { recursive: true })
  const db = new Database(DATABASE_PATH)
  const catalogPersister = createSqliteBunPersister(
    catalogStore,
    db,
    { mode: 'json', storeTableName: CATALOG_TABLE_NAME },
    undefined,
    reportIgnoredPersistenceError('catalog'),
  )
  const cliPersister = createSqliteBunPersister(
    cliStore,
    db,
    { mode: 'json', storeTableName: CLI_TABLE_NAME },
    undefined,
    reportIgnoredPersistenceError('cli'),
  )
  const libraryPersister = createSqliteBunPersister(
    libraryStore,
    db,
    { mode: 'json', storeTableName: LIBRARY_TABLE_NAME },
    undefined,
    reportIgnoredPersistenceError('library'),
  )
  await catalogPersister.load(() => catalogStore.getContent())
  await cliPersister.load(() => cliStore.getContent())
  await libraryPersister.load(() => libraryStore.getContent())

  // Library commands start from the latest remote state when sync is configured.
  const remoteSync = await connectLibrarySynchronizer(libraryStore, options)
  await remoteSync?.load()

  let closed = false
  return {
    async close() {
      if (closed) {
        return
      }
      closed = true

      // The command boundary publishes synced library state, checkpoints the local cache,
      // then drops the socket. Remote sync is best-effort and logs its own failures; only
      // local persistence (and never destroy) is allowed to throw.
      await remoteSync?.save()
      await catalogPersister.save()
      await cliPersister.save()
      await libraryPersister.save()
      await remoteSync?.destroy()
    },
    stores,
  }
}

// Owns the whole remote-sync decision: whether it is enabled, connecting, and the one TinyBase
// quirk that errors are swallowed and reported through a callback rather than thrown. Sync runs
// only at the start/stop boundary and never throws, so failures are logged the moment they arrive
// and the runtime treats the returned handle as fire-and-forget.
async function connectLibrarySynchronizer(
  libraryStore: LibraryRawStore,
  options: CliStoreRuntimeOptions,
): Promise<LibrarySynchronizer | undefined> {
  // Remote sync is opt-in: it needs a Worker URL and the syncEnabled switch left on.
  // Bun loads .env files automatically; empty strings are treated as absent.
  const workerUrl = options.syncEnabled === false ? undefined : process.env.SYNC_WORKER_URL?.trim()
  if (workerUrl === undefined || workerUrl === '') {
    return undefined
  }

  // Convert the Worker origin into the Durable Object websocket endpoint.
  const url = new URL('/sync', workerUrl)
  if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }
  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  }

  const webSocket = new WebSocket(url.toString())
  const synchronizer = await withSyncTimeout(
    createWsSynchronizer(
      libraryStore,
      webSocket,
      SYNC_REQUEST_TIMEOUT_SECONDS,
      undefined,
      undefined,
      (error: unknown) => {
        console.error('[stores:library] sync error', error)
      },
    ),
    'connect',
  )

  // Connection timed out or never opened; carry on without remote sync.
  if (synchronizer === undefined) {
    webSocket.close()
    return undefined
  }

  return {
    // destroy is the one piece of teardown that matters: it closes the socket so the
    // process can exit. It never throws, so it is never the reason a command fails.
    destroy: async () => {
      await withSyncTimeout(synchronizer.destroy(), 'destroy')
    },
    load: async () => {
      await withSyncTimeout(
        synchronizer.load(() => libraryStore.getContent()),
        'load',
      )
    },
    save: async () => {
      await withSyncTimeout(synchronizer.save(), 'save')
    },
  }
}

// Best-effort race: resolve to undefined (logging the cause) if the sync operation rejects or
// outruns the timeout. `runSync` owns the rejection so the loser of the race is always observed.
async function withSyncTimeout<T>(
  operation: Promise<T>,
  label: string,
): Promise<Awaited<T> | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined

  // oxlint-disable-next-line promise/avoid-new -- The timeout must be cancellable when sync wins the race.
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      console.error(`[stores:library] sync ${label} timed out after ${SYNC_TIMEOUT_MS}ms`)
      // oxlint-disable-next-line unicorn/no-useless-undefined -- Promise<undefined> requires the explicit value.
      resolve(undefined)
    }, SYNC_TIMEOUT_MS)
  })

  try {
    return await Promise.race([runSync(operation, label), timeout])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}

async function runSync<T>(operation: Promise<T>, label: string): Promise<Awaited<T> | undefined> {
  try {
    return await operation
  } catch (error: unknown) {
    console.error(`[stores:library] sync ${label} error`, error)
    return undefined
  }
}

function reportIgnoredPersistenceError(table: string) {
  return (error: unknown) => {
    console.error(`[stores:${table}] ignored persistence error`, error)
  }
}
