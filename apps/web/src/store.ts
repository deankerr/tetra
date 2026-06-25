import { catalogStoreDefinition } from '@tetra/stores/catalog'
import { libraryStoreDefinition } from '@tetra/stores/library'
import { defineTypedStore } from '@tetra/tinybase-schema'
import { createStoreReactApi } from '@tetra/tinybase-schema/react'
import {
  createMergeableStoreInstance,
  createStoreInstance,
  defineStoreDefinition,
} from '@tetra/tinybase-schema/runtime'
import {
  createLocalPersister,
  createSessionPersister,
} from 'tinybase/persisters/persister-browser/with-schemas'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db/with-schemas'
import { createBroadcastChannelSynchronizer } from 'tinybase/synchronizers/synchronizer-broadcast-channel/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'
import { z } from 'zod'

const CATALOG_DB_NAME = 'tetra:catalog'
const LIBRARY_BROADCAST_CHANNEL = 'tetra:library'
const LIBRARY_STORAGE_NAME = 'tetra:library'
const SYNC_ENABLED = getEnv('VITE_SYNC_ENABLED') === 'true'
const WEB_STORAGE_NAME = 'tetra:web'

const webStoreSchema = defineTypedStore({
  tables: {
    draftSessions: z.object({
      sessionId: z.string(),
    }),
    sessionThreadViews: z.object({
      threadAnchorMessageId: z.string().nullable().default(null),
    }),
  },
  values: {
    jsonView: z
      .object({
        json: z.string(),
        title: z.string(),
      })
      .default({ json: '', title: '' }),
    settingsOpen: z.boolean().default(false),
  },
})

const webStoreDefinition = defineStoreDefinition({
  id: 'web',
  indexIds: [],
  schema: webStoreSchema,
})

interface RuntimePersister {
  addStatusListener(listener: (persister: RuntimePersister, status: number) => void): string
  delListener(listenerId: string): unknown
  destroy(): Promise<unknown>
  getStatus(): number
  save(): Promise<unknown>
  stopAutoSave(): Promise<unknown>
}

function createWebStoreInstances() {
  // The shared library is mergeable so local cache, tab sync, and remote sync speak one shape.
  return {
    catalog: createStoreInstance(catalogStoreDefinition),
    library: createMergeableStoreInstance(libraryStoreDefinition),
    web: createStoreInstance(webStoreDefinition),
  }
}

export type WebStoreInstances = ReturnType<typeof createWebStoreInstances>
export type WebStoreRuntime = Awaited<ReturnType<typeof createWebStoreRuntime>>

export async function createWebStoreRuntime() {
  const stores = createWebStoreInstances()
  const catalogStore = stores.catalog.rawStore
  const libraryStore = stores.library.rawStore
  const webStore = stores.web.rawStore

  // Browser-local stores persist independently: catalog in IndexedDB, UI state in sessionStorage.
  const catalogPersister = createIndexedDbPersister(
    catalogStore,
    CATALOG_DB_NAME,
    undefined,
    reportIgnoredPersistenceError,
  )
  const webPersister = createSessionPersister(
    webStore,
    WEB_STORAGE_NAME,
    reportIgnoredPersistenceError,
  )
  const libraryPersister = createLocalPersister(
    libraryStore,
    LIBRARY_STORAGE_NAME,
    reportIgnoredPersistenceError,
  )
  await catalogPersister.load(() => catalogStore.getContent())
  await webPersister.load(() => webStore.getContent())
  await libraryPersister.load(() => libraryStore.getContent())
  await catalogPersister.startAutoSave()
  await webPersister.startAutoSave()
  await libraryPersister.startAutoSave()

  // Keep same-origin tabs converged without making localStorage the live sync bus.
  const tabSynchronizer = createBroadcastChannelSynchronizer(
    libraryStore,
    LIBRARY_BROADCAST_CHANNEL,
    undefined,
    undefined,
    reportIgnoredTabSyncError,
  )
  await tabSynchronizer.startSync()

  // Remote sync is opt-in for the browser, even when a worker URL is configured.
  const syncWorkerUrl = SYNC_ENABLED ? getEnv('VITE_SYNC_WORKER_URL') : undefined
  const remoteSynchronizer =
    syncWorkerUrl === undefined
      ? undefined
      : await createWsSynchronizer(
          libraryStore,
          createLibrarySyncWebSocket(syncWorkerUrl),
          undefined,
          undefined,
          undefined,
          reportIgnoredRemoteSyncError,
        )
  await remoteSynchronizer?.startSync()

  let closed = false
  return {
    async close() {
      if (closed) {
        return
      }
      closed = true
      await remoteSynchronizer?.destroy()
      await tabSynchronizer.destroy()
      await closePersisters([catalogPersister, webPersister, libraryPersister])
    },
    stores,
  }
}

async function closePersisters(persisters: RuntimePersister[]): Promise<void> {
  // Auto-save may already have an async save in flight, so wait before final save and destroy.
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
  const value = import.meta.env[name]?.trim()
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

function reportIgnoredPersistenceError(error: unknown): void {
  console.error('[stores:web] ignored persistence error', error)
}

function reportIgnoredTabSyncError(error: unknown): void {
  // A single browser tab has no BroadcastChannel peer to answer TinyBase's startup probe.
  if (isNoPeerStartupSyncError(error)) {
    return
  }

  console.error('[stores:web] ignored tab library sync error', error)
}

function reportIgnoredRemoteSyncError(error: unknown): void {
  console.error('[stores:web] ignored remote library sync error', error)
}

function isNoPeerStartupSyncError(error: unknown): boolean {
  return (
    typeof error === 'string' &&
    error.startsWith('No response from anyone to ') &&
    error.endsWith(', 1')
  )
}

export const catalogTinybase = createStoreReactApi(catalogStoreDefinition)
export const libraryTinybase = createStoreReactApi(libraryStoreDefinition)
export const webTinybase = createStoreReactApi(webStoreDefinition)
