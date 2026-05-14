import type { TetraStore } from '@tetra/store'

export interface RuntimeContext {
  controllers: Map<string, AbortController>
  indexes: TetraStore['indexes']
  store: TetraStore['store']
  transaction: (fn: () => void) => void
}
