import { createDataLayer } from './data/index.ts'
import { createAppIndexes, createAppStore } from './data/store.ts'
import { startEngine } from './engine.ts'
import type { Engine } from './engine.ts'
import { createOpenRouterTransport } from './openrouter-transport.ts'
import { bindOperations } from './operations.ts'

export type RuntimeConfig = {
  runtimeId: string
}

export type Runtime = ReturnType<typeof createRuntime>

export function createRuntime(config: RuntimeConfig) {
  const store = createAppStore()
  const indexes = createAppIndexes(store)
  const data = createDataLayer(store, indexes)
  const operations = bindOperations(data, config.runtimeId)

  let engine: Engine | null = null

  return {
    ...operations,
    agents: data.agents,
    indexes,
    messages: data.messages,
    requests: data.requests,
    sessions: data.sessions,

    start() {
      if (engine !== null) {
        return
      }

      // Transport created here — reads API key from store at stream time
      const transport = createOpenRouterTransport(() => {
        const key = store.getValue('openrouterApiKey')
        return typeof key === 'string' && key !== '' ? key : undefined
      })
      engine = startEngine(data, transport, config.runtimeId)
    },

    stop() {
      engine?.stop()
      engine = null
    },

    store,
    transaction: data.transaction,
  }
}
