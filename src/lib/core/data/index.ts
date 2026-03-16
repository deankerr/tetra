import { createAgentDAO } from '@/lib/core/data/agents'
import type { AgentDAO } from '@/lib/core/data/agents'
import { createMessageDAO } from '@/lib/core/data/messages'
import type { MessageDAO } from '@/lib/core/data/messages'
import { createSessionDAO } from '@/lib/core/data/sessions'
import type { SessionDAO } from '@/lib/core/data/sessions'
import type { AppIndexes, AppStore } from '@/lib/core/data/stores'
import { createAppIndexes, createAppPersister, createAppStore } from '@/lib/core/data/stores'

export type DataLayer = {
  agents: AgentDAO
  messages: MessageDAO
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

  const agents = createAgentDAO(store)
  const messages = createMessageDAO(store, indexes)
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
    sessions,
    store,

    transaction(fn) {
      store.transaction(fn)
    },
  }
}
