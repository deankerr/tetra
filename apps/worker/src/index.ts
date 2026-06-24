import { libraryStoreDefinition } from '@tetra/stores/library'
import type { StoreSchemasFor } from '@tetra/tinybase-schema'
import { createMergeableStoreInstance } from '@tetra/tinybase-schema/runtime'
import {
  WsServerDurableObject,
  getWsServerDurableObjectFetch,
} from 'tinybase/synchronizers/synchronizer-ws-server-durable-object/with-schemas'

const SYNC_PATH = '/tetra'
const RESET_PATH = '/tetra/reset'
const RESET_CORS_HEADERS = {
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Max-Age': '86400',
}

export interface Env {
  TinyBaseDurableObjects: DurableObjectNamespace<TinyBaseDurableObject>
}

type WorkerStoreSchemas = StoreSchemasFor<(typeof libraryStoreDefinition)['schema']>
type WorkerRuntime = Awaited<ReturnType<typeof createWorkerStoreRuntime>>

const runtimes = new WeakMap<TinyBaseDurableObject, WorkerRuntime>()

async function createWorkerStoreRuntime(sqlStorage: unknown) {
  // The sync server hosts only the shared library store, and it must be mergeable.
  const library = createMergeableStoreInstance(libraryStoreDefinition)
  const { createDurableObjectSqlStoragePersister } =
    await import('tinybase/persisters/persister-durable-object-sql-storage/with-schemas')
  const libraryPersister = createDurableObjectSqlStoragePersister(
    library.rawStore,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Cloudflare SQL storage is supplied by the Worker runtime.
    sqlStorage as never,
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
    library,
    libraryPersister,
  }
}

function addResetCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(RESET_CORS_HEADERS)) {
    headers.set(name, value)
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

function getResetResponse(request: Request, env: Env): Promise<Response> | Response | undefined {
  const url = new URL(request.url)
  if (url.pathname !== RESET_PATH) {
    return undefined
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: RESET_CORS_HEADERS,
      status: 204,
    })
  }
  if (request.method !== 'DELETE') {
    return addResetCorsHeaders(
      new Response('Method not allowed', {
        headers: {
          Allow: 'DELETE, OPTIONS',
        },
        status: 405,
      }),
    )
  }

  return Promise.resolve(
    env.TinyBaseDurableObjects.getByName(SYNC_PATH.slice(1)).fetch(request),
  ).then(addResetCorsHeaders)
}

// Each DO instance hosts the shared library store, persisted to its SQLite storage.
// Clients connect via WebSocket; the base class handles sync protocol and hibernation.
export class TinyBaseDurableObject extends WsServerDurableObject<WorkerStoreSchemas, Env> {
  override async createPersister() {
    const runtime = await createWorkerStoreRuntime(this.ctx.storage.sql)
    runtimes.set(this, runtime)
    return runtime.libraryPersister
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== RESET_PATH) {
      const response = WsServerDurableObject.prototype.fetch?.call(this, request)
      if (response === undefined) {
        return new Response('WebSocket handler is not ready', { status: 503 })
      }

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TinyBase's implementation returns Response synchronously.
      return response as Response
    }

    const runtime = runtimes.get(this)
    if (runtime === undefined) {
      return new Response('Store is not ready', { status: 503 })
    }

    const { rawStore } = runtime.library
    rawStore.delTables()
    rawStore.delValues()
    await runtime.libraryPersister.save()

    return Response.json({ ok: true })
  }
}

const wsFetch = getWsServerDurableObjectFetch<WorkerStoreSchemas, 'TinyBaseDurableObjects'>(
  'TinyBaseDurableObjects',
)

export default {
  fetch(request, env): Promise<Response> | Response {
    return getResetResponse(request, env) ?? wsFetch(request, env)
  },
} satisfies ExportedHandler<Env>
