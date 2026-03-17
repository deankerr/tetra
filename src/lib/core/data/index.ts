import { createAgentDAO } from '@/lib/core/data/agents'
import type { AgentDAO } from '@/lib/core/data/agents'
import { createMessageDAO } from '@/lib/core/data/messages'
import type { MessageDAO } from '@/lib/core/data/messages'
import { createRequestDAO } from '@/lib/core/data/requests'
import type { RequestDAO } from '@/lib/core/data/requests'
import { createSessionDAO } from '@/lib/core/data/sessions'
import type { SessionDAO } from '@/lib/core/data/sessions'
import type { AppIndexes, AppStore } from '@/lib/core/data/stores'
import { createAppIndexes, createAppPersister, createAppStore } from '@/lib/core/data/stores'

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
  const persister = createAppPersister(store)

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
      await persister.startAutoPersisting()
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
