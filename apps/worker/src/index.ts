import { libraryStoreDefinition } from '@tetra/schemas/library'
import type { StoreSchemasFor } from '@tetra/tinybase-schema'
import { createMergeableStoreInstance } from '@tetra/tinybase-schema/runtime'
import { createDurableObjectSqlStoragePersister } from 'tinybase/persisters/persister-durable-object-sql-storage/with-schemas'
import {
  WsServerDurableObject,
  getWsServerDurableObjectFetch,
} from 'tinybase/synchronizers/synchronizer-ws-server-durable-object/with-schemas'

const LIBRARY_DURABLE_OBJECT_NAME = 'sync'
const LIBRARY_SYNC_PATH = `/${LIBRARY_DURABLE_OBJECT_NAME}`
const LIBRARY_RESET_PATH = `${LIBRARY_SYNC_PATH}/reset`

export interface Env {
  TinyBaseDurableObjects: DurableObjectNamespace<TinyBaseDurableObject>
}

type WorkerStoreSchemas = StoreSchemasFor<(typeof libraryStoreDefinition)['schema']>
type LibraryRuntime = ReturnType<typeof createLibraryRuntime>

// TinyBase calls createPersister during super(), before subclass fields are initialized.
const libraryRuntimes = new WeakMap<TinyBaseDurableObject, LibraryRuntime>()

function createLibraryRuntime(sqlStorage: DurableObjectStorage['sql']) {
  // The sync server hosts only the shared library store, and it must be mergeable.
  const library = createMergeableStoreInstance(libraryStoreDefinition)
  const libraryPersister = createDurableObjectSqlStoragePersister(
    library.rawStore,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Cloudflare SQL storage is supplied by the Worker runtime.
    sqlStorage as never,
    { mode: 'fragmented', storagePrefix: 'library_' },
    undefined,
    reportIgnoredPersistenceError,
  )

  return {
    library,
    libraryPersister,
  }
}

function handleLibraryResetRequest(request: Request, env: Env): Promise<Response> | Response {
  // Reset is an internal maintenance route, not a browser-facing endpoint.
  if (request.method !== 'DELETE') {
    return new Response('Method not allowed', {
      headers: {
        Allow: 'DELETE',
      },
      status: 405,
    })
  }

  return env.TinyBaseDurableObjects.getByName(LIBRARY_DURABLE_OBJECT_NAME).fetch(request)
}

// Each DO instance hosts the shared library store, persisted to its SQLite storage.
// Clients connect via WebSocket; the base class handles sync protocol and hibernation.
export class TinyBaseDurableObject extends WsServerDurableObject<WorkerStoreSchemas, Env> {
  override createPersister() {
    const runtime = createLibraryRuntime(this.ctx.storage.sql)
    libraryRuntimes.set(this, runtime)
    return runtime.libraryPersister
  }

  override async fetch(request: Request): Promise<Response> {
    // Reset mutates the live TinyBase store, then saves that cleared state.
    const url = new URL(request.url)
    if (url.pathname === LIBRARY_RESET_PATH) {
      const runtime = libraryRuntimes.get(this)
      if (runtime === undefined) {
        return new Response('Store is not ready', { status: 503 })
      }

      const { rawStore } = runtime.library
      rawStore.delTables()
      rawStore.delValues()
      await runtime.libraryPersister.save()

      return Response.json({ ok: true })
    }

    // All other Durable Object requests belong to TinyBase's WebSocket handler.
    const response = await super.fetch?.(request)
    if (response === undefined) {
      return new Response('WebSocket handler is not ready', { status: 503 })
    }

    return response
  }
}

function reportIgnoredPersistenceError(error: unknown): void {
  console.error('[worker:library] ignored persistence error', error)
}

const handleLibrarySyncRequest = getWsServerDurableObjectFetch<
  WorkerStoreSchemas,
  'TinyBaseDurableObjects'
>('TinyBaseDurableObjects')

export default {
  fetch(request, env): Promise<Response> | Response {
    // The Worker routes the internal reset path; TinyBase routes sync websocket traffic.
    const url = new URL(request.url)
    if (url.pathname === LIBRARY_RESET_PATH) {
      return handleLibraryResetRequest(request, env)
    }

    return handleLibrarySyncRequest(request, env)
  },
} satisfies ExportedHandler<Env>
