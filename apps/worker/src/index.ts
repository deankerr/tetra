import {
  WsServerDurableObject,
  getWsServerDurableObjectFetch,
} from 'tinybase/synchronizers/synchronizer-ws-server-durable-object'

// Keys are client-generated random channel names; possession of a key is access to its channel.
// The relay validates only the path shape and otherwise treats keys as opaque.
const SYNC_PATH_REGEX = /^\/sync\/[\w-]{16,64}$/u

export interface Env {
  RelayDurableObjects: DurableObjectNamespace<RelayDurableObject>
}

// The relay stores nothing. Without a createPersister override, the base Durable Object never
// creates a server-side store: it only forwards sync frames between clients connected to the same
// channel. Data at rest exists solely on user devices, and an idle channel simply ceases to exist.
export class RelayDurableObject extends WsServerDurableObject<Env> {}

const handleSyncRequest = getWsServerDurableObjectFetch('RelayDurableObjects')

export default {
  fetch(request, env): Response {
    // Each valid key routes to its own lazily-created relay channel (one Durable Object per path).
    const url = new URL(request.url)
    if (!SYNC_PATH_REGEX.test(url.pathname)) {
      return new Response('Not found', { status: 404 })
    }

    return handleSyncRequest(request, env)
  },
} satisfies ExportedHandler<Env>
