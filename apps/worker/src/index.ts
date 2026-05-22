import { createMergeableStore } from 'tinybase/mergeable-store'
import { createDurableObjectSqlStoragePersister } from 'tinybase/persisters/persister-durable-object-sql-storage'
import {
  WsServerDurableObject,
  getWsServerDurableObjectFetch,
} from 'tinybase/synchronizers/synchronizer-ws-server-durable-object'

export interface Env {
  TinyBaseDurableObjects: DurableObjectNamespace<TinyBaseDurableObject>
}

// Each DO instance holds one MergeableStore, persisted to its SQLite storage.
// Clients connect via WebSocket; the base class handles sync protocol and hibernation.
export class TinyBaseDurableObject extends WsServerDurableObject<Env> {
  override createPersister() {
    return createDurableObjectSqlStoragePersister(createMergeableStore(), this.ctx.storage.sql)
  }
}

export default {
  fetch: getWsServerDurableObjectFetch('TinyBaseDurableObjects'),
}
