import { createMergeableStore } from 'tinybase/mergeable-store'
import type { MergeableStore } from 'tinybase/mergeable-store'
import { createDurableObjectSqlStoragePersister } from 'tinybase/persisters/persister-durable-object-sql-storage'
import {
  WsServerDurableObject,
  getWsServerDurableObjectFetch,
} from 'tinybase/synchronizers/synchronizer-ws-server-durable-object'

const SYNC_PATH = '/tetra'
const RESET_PATH = '/tetra/reset'

export interface Env {
  TinyBaseDurableObjects: DurableObjectNamespace<TinyBaseDurableObject>
}

type DurableObjectSqlStoragePersister = ReturnType<typeof createDurableObjectSqlStoragePersister>

const persisters = new WeakMap<TinyBaseDurableObject, DurableObjectSqlStoragePersister>()
const stores = new WeakMap<TinyBaseDurableObject, MergeableStore>()

function getResetResponse(request: Request, env: Env): Promise<Response> | Response | undefined {
  const url = new URL(request.url)
  if (url.pathname !== RESET_PATH) {
    return undefined
  }
  if (request.method !== 'DELETE') {
    return new Response('Method not allowed', { status: 405 })
  }

  return env.TinyBaseDurableObjects.getByName(SYNC_PATH.slice(1)).fetch(request)
}

// Each DO instance holds one MergeableStore, persisted to its SQLite storage.
// Clients connect via WebSocket; the base class handles sync protocol and hibernation.
export class TinyBaseDurableObject extends WsServerDurableObject<Env> {
  override createPersister() {
    const store = createMergeableStore()
    const persister = createDurableObjectSqlStoragePersister(store, this.ctx.storage.sql)
    stores.set(this, store)
    persisters.set(this, persister)
    return persister
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

    const store = stores.get(this)
    const persister = persisters.get(this)
    if (store === undefined || persister === undefined) {
      return new Response('Store is not ready', { status: 503 })
    }

    store.delTables()
    store.delValues()
    await persister.save()

    return Response.json({ ok: true })
  }
}

const wsFetch = getWsServerDurableObjectFetch('TinyBaseDurableObjects')

export default {
  fetch(request, env): Promise<Response> | Response {
    return getResetResponse(request, env) ?? wsFetch(request, env)
  },
} satisfies ExportedHandler<Env>
