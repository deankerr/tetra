import { createAgentDAO } from './agents.ts'
import type { AgentDAO } from './agents.ts'
import { createMessageDAO } from './messages.ts'
import type { MessageDAO } from './messages.ts'
import { createRequestDAO } from './requests.ts'
import type { RequestDAO } from './requests.ts'
import { createSessionDAO } from './sessions.ts'
import type { SessionDAO } from './sessions.ts'
import type { AppIndexes, AppStore } from './store.ts'

export type DataLayer = {
  agents: AgentDAO
  messages: MessageDAO
  requests: RequestDAO
  sessions: SessionDAO
  store: AppStore
  indexes: AppIndexes
  transaction: (fn: () => void) => void
}

export const createDataLayer = (store: AppStore, indexes: AppIndexes): DataLayer => {
  const agents = createAgentDAO(store, indexes)
  const messages = createMessageDAO(store, indexes)
  const requests = createRequestDAO(store, indexes)
  const sessions = createSessionDAO(store, indexes)

  return {
    agents,
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
