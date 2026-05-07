import { createAppIndexes, createAppStore } from './store.ts'

export type TetraStore = ReturnType<typeof createTetraStore>

export function createTetraStore() {
  const store = createAppStore()
  const indexes = createAppIndexes(store)

  return {
    tinybase: { indexes, store },
    transaction(fn: () => void) {
      store.transaction(fn)
    },
  }
}
