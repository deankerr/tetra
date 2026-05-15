import type { TetraStore } from '@tetra/store'

import { createRequests } from './requests.ts'
import { createSessions } from './sessions.ts'

export type TetraRuntime = ReturnType<typeof createTetraRuntime>

export const createTetraRuntime = (config: { store: TetraStore }) => {
  // Runtime modules share one imperative handle into the TinyBase store.
  const context = {
    controllers: new Map<string, AbortController>(),
    indexes: config.store.indexes,
    store: config.store.store,
  }

  // Requests own execution records; sessions own transcript mutation.
  const requests = createRequests(context)
  const sessions = createSessions(context)

  return {
    recoverInterruptedRequests() {
      // In-progress requests cannot survive a browser reload yet.
      for (const id of context.store.getRowIds('requests')) {
        const status = context.store.getCell('requests', id, 'status')
        if (status !== 'pending' && status !== 'streaming') {
          continue
        }

        context.store.setPartialRow('requests', id, {
          errorMessage: 'Interrupted by app restart',
          status: 'error',
        })
      }

      console.log('[runtime]', 'recovered interrupted requests')
    },

    requests,
    sessions,

    stop() {
      // Runtime shutdown aborts every active provider stream.
      for (const controller of context.controllers.values()) {
        controller.abort('shutdown')
      }
      context.controllers.clear()
      console.log('[runtime]', 'stopped')
    },
  }
}
