import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'

import { createAgentDAO } from '@/lib/core/data/agents'
import type { AgentDAO } from '@/lib/core/data/agents'
import { createMessageDAO } from '@/lib/core/data/messages'
import type { MessageDAO } from '@/lib/core/data/messages'
import { createRequestDAO } from '@/lib/core/data/requests'
import type { RequestDAO } from '@/lib/core/data/requests'
import { createSessionDAO } from '@/lib/core/data/sessions'
import type { SessionDAO } from '@/lib/core/data/sessions'
import type { AppIndexes, AppStore } from '@/lib/core/data/store'
import { createAppIndexes, createAppPersister, createAppStore } from '@/lib/core/data/store'

const SYNC_URL = 'ws://localhost:8048'

async function startSync(store: AppStore) {
  try {
    const ws = new WebSocket(SYNC_URL)
    const synchronizer = await createWsSynchronizer(store, ws)
    await synchronizer.startSync()
    console.log('[data] sync connected', SYNC_URL)
  } catch (error) {
    console.warn('[data] sync unavailable, running local-only', error)
  }
}

export type DataLayer = {
  agents: AgentDAO
  messages: MessageDAO
  requests: RequestDAO
  sessions: SessionDAO
  store: AppStore
  indexes: AppIndexes
  initialize: () => Promise<void>
  transaction: (fn: () => void) => void
}

export const createDataLayer = (): DataLayer => {
  const store = createAppStore()
  const indexes = createAppIndexes(store)
  const agents = createAgentDAO(store, indexes)
  const messages = createMessageDAO(store, indexes)
  const requests = createRequestDAO(store, indexes)
  const sessions = createSessionDAO(store, indexes)

  let initialized = false

  return {
    agents,

    async initialize() {
      if (initialized) {
        return
      }
      initialized = true

      // OPFS persistence first
      const persister = await createAppPersister(store)
      await persister.startAutoPersisting()

      // Sync to server (best-effort, non-blocking — app works fine without it)
      void startSync(store)
    },

    indexes,
    messages,
    requests,
    sessions,
    store,

    transaction(fn) {
      store.transaction(fn)
    },
  }
}
