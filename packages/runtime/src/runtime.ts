import type { Inference } from '@tetra/inference'
import type { TetraStore } from '@tetra/store'

import { createCommands } from './commands.ts'
import type { RuntimeContext } from './types.ts'

export type TetraRuntime = ReturnType<typeof createTetraRuntime>

export const createTetraRuntime = (config: { inference: Inference; store: TetraStore }) => {
  const context: RuntimeContext = {
    controllers: new Map(),
    indexes: config.store.tinybase.indexes,
    inference: config.inference,
    store: config.store.tinybase.store,
    transaction: (fn) => {
      config.store.transaction(fn)
    },
  }

  return {
    commands: createCommands(context),

    start() {
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

      console.log('[runtime]', 'started')
    },

    stop() {
      for (const controller of context.controllers.values()) {
        controller.abort()
      }
      context.controllers.clear()
      console.log('[runtime]', 'stopped')
    },
  }
}
