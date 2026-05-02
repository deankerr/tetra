import type { AppIndexes, AppStore } from '../store.ts'
import { createMessages } from './messages.ts'
import { createRequests } from './requests.ts'
import { createSessions } from './sessions.ts'

export type DataLayer = {
  indexes: AppIndexes
  messages: ReturnType<typeof createMessages>
  requests: ReturnType<typeof createRequests>
  sessions: ReturnType<typeof createSessions>
  store: AppStore
  transaction: (fn: () => void) => void
}

export const createTables = (store: AppStore, indexes: AppIndexes): DataLayer => {
  const messages = createMessages(store, indexes)
  const requests = createRequests(store, indexes)
  const sessions = createSessions(store, indexes)

  return {
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
