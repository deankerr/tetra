import { startEngine } from './engine.ts'
import type { Engine } from './engine.ts'
import { bindOperations } from './operations.ts'
import { createAppIndexes, createAppStore } from './store.ts'
import { createTables } from './tables/index.ts'

export type RuntimeConfig = {
  runtimeId: string
}

export type Runtime = ReturnType<typeof createRuntime>

export function createRuntime(config: RuntimeConfig) {
  const store = createAppStore()
  const indexes = createAppIndexes(store)
  const data = createTables(store, indexes)
  const operations = bindOperations(data, config.runtimeId)

  let engine: Engine | null = null

  return {
    ...operations,
    indexes,
    messages: data.messages,
    requests: data.requests,
    sessions: data.sessions,

    start() {
      if (engine !== null) {
        return
      }

      engine = startEngine(data, config.runtimeId)
    },

    stop() {
      engine?.stop()
      engine = null
    },

    store,
    transaction: data.transaction,
  }
}
