import { bindCommands } from './commands.ts'
import { createAppIndexes, createAppStore } from './store.ts'
import { createTables } from './tables/index.ts'

export type TetraStore = ReturnType<typeof createTetraStore>

export function createTetraStore() {
  const store = createAppStore()
  const indexes = createAppIndexes(store)
  const data = createTables(store, indexes)
  const commands = bindCommands(data)

  return {
    commands,
    internal: { data },
    queries: {
      messages: data.messages,
      requests: data.requests,
      sessions: data.sessions,
    },
    tinybase: { indexes, store },
    transaction: data.transaction,
  }
}
