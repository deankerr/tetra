import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

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

const DATA_DIR = getEnv('TETRA_DATA_DIR') ?? '.tetra'
const DB_PATH = getEnv('TETRA_DB') ?? join(DATA_DIR, 'tetra.db')
const CATALOG_TABLE_NAME = 'catalog'
const CLI_TABLE_NAME = 'cli'
const LIBRARY_TABLE_NAME = 'library'
const SYNC_START_TIMEOUT_MS = 3000
const SYNC_START_TIMED_OUT = Symbol('syncStartTimedOut')

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

interface RuntimePersister {
  addStatusListener(listener: (persister: RuntimePersister, status: number) => void): string
  delListener(listenerId: string): unknown
  destroy(): Promise<unknown>
  getStatus(): number
  save(): Promise<unknown>
  stopAutoSave(): Promise<unknown>
}

interface RuntimeSynchronizer {
  destroy(): Promise<unknown>
  startSync(): Promise<unknown>
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
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const db = new Database(DB_PATH)
  const catalogPersister = createSqliteBunPersister(
    catalogStore,
    db,
    { mode: 'json', storeTableName: CATALOG_TABLE_NAME },
    undefined,
    reportIgnoredPersistenceError,
  )
  const cliPersister = createSqliteBunPersister(
    cliStore,
    db,
    { mode: 'json', storeTableName: CLI_TABLE_NAME },
    undefined,
    reportIgnoredPersistenceError,
  )
  const libraryPersister = createSqliteBunPersister(
    libraryStore,
    db,
    { mode: 'json', storeTableName: LIBRARY_TABLE_NAME },
    undefined,
    reportIgnoredPersistenceError,
  )
  await catalogPersister.load(() => catalogStore.getContent())
  await cliPersister.load(() => cliStore.getContent())
  await libraryPersister.load(() => libraryStore.getContent())

  // Library mutations can stream over time, so keep checkpointing that store during commands.
  await libraryPersister.startAutoSave()

  // Remote sync uses the shared worker URL unless the CLI explicitly disables it.
  const syncWorkerUrl = options.syncEnabled === false ? undefined : getEnv('SYNC_WORKER_URL')
  const remoteSynchronizer = await startLibrarySync(libraryStore, syncWorkerUrl)

  let closed = false
  return {
    async close() {
      if (closed) {
        return
      }
      closed = true
      await remoteSynchronizer?.destroy()
      await closePersisters([catalogPersister, cliPersister, libraryPersister])
    },
    stores,
  }
}

async function closePersisters(persisters: RuntimePersister[]): Promise<void> {
  // Auto-save may already have an async save in flight, so wait before closing shared storage.
  for (const persister of persisters) {
    await persister.stopAutoSave()
  }
  for (const persister of persisters) {
    await waitForPersisterIdle(persister)
  }
  for (const persister of persisters) {
    await persister.save()
  }
  for (const persister of persisters) {
    await waitForPersisterIdle(persister)
  }
  for (const persister of persisters) {
    await persister.destroy()
  }
}

async function waitForPersisterIdle(persister: RuntimePersister): Promise<void> {
  if (persister.getStatus() === 0) {
    return
  }

  // oxlint-disable-next-line promise/avoid-new -- TinyBase exposes persister status changes through a listener API.
  await new Promise<void>((resolve) => {
    const listenerId = persister.addStatusListener((_persister, status) => {
      if (status !== 0) {
        return
      }
      persister.delListener(listenerId)
      resolve()
    })
  })
}

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value === undefined || value === '' ? undefined : value
}

function createLibrarySyncWebSocket(workerUrl: string): WebSocket {
  // Convert the Worker origin into the Durable Object websocket endpoint.
  const url = new URL('/sync', workerUrl)
  if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }
  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  }

  return new WebSocket(url.toString())
}

async function startLibrarySync(
  libraryStore: LibraryRawStore,
  syncWorkerUrl: string | undefined,
): Promise<RuntimeSynchronizer | undefined> {
  if (syncWorkerUrl === undefined) {
    return undefined
  }

  // Optional sync should not stop a short-lived CLI command from using its local cache.
  const webSocket = createLibrarySyncWebSocket(syncWorkerUrl)
  const synchronizerPromise = createWsSynchronizer(
    libraryStore,
    webSocket,
    undefined,
    undefined,
    undefined,
    reportIgnoredSyncError,
  )
  const synchronizer = await withSyncStartupTimeout(synchronizerPromise, () => {
    webSocket.close()
  })
  if (synchronizer === undefined) {
    void destroyLateSynchronizer(synchronizerPromise)
    return undefined
  }

  // Starting sync performs the initial TinyBase exchange, but it is still optional here.
  const started = await withSyncStartupTimeout(startSynchronizer(synchronizer), () => {
    void synchronizer.destroy()
  })
  return started
}

async function withSyncStartupTimeout<T>(
  promise: Promise<T>,
  onTimeout: () => void,
): Promise<T | undefined> {
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    // oxlint-disable-next-line promise/avoid-new -- The timeout must be cleared when sync wins the race.
    const timeoutPromise = new Promise<typeof SYNC_START_TIMED_OUT>((resolve) => {
      timeout = setTimeout(() => {
        console.warn(
          `[stores:cli] library sync startup timed out after ${SYNC_START_TIMEOUT_MS}ms; continuing with local cache`,
        )
        onTimeout()
        resolve(SYNC_START_TIMED_OUT)
      }, SYNC_START_TIMEOUT_MS)
    })
    const result = await Promise.race([promise, timeoutPromise])
    return result === SYNC_START_TIMED_OUT ? undefined : result
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout)
    }
  }
}

async function startSynchronizer(synchronizer: RuntimeSynchronizer): Promise<RuntimeSynchronizer> {
  await synchronizer.startSync()
  return synchronizer
}

async function destroyLateSynchronizer(
  synchronizerPromise: Promise<RuntimeSynchronizer>,
): Promise<void> {
  try {
    const synchronizer = await synchronizerPromise
    await synchronizer.destroy()
  } catch (error) {
    reportIgnoredSyncError(error)
  }
}

function reportIgnoredPersistenceError(error: unknown): void {
  console.error('[stores:cli] ignored persistence error', error)
}

function reportIgnoredSyncError(error: unknown): void {
  console.error('[stores:cli] ignored library sync error', error)
}
