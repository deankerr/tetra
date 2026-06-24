import { createCoreModules } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'

import { createCliStoreInstances } from './store'
import type { CliStoreInstances } from './store'

export function createCliApp() {
  const stores = createCliStoreInstances()
  const core = createCoreModules({
    credentials: credentialStore,
    stores: {
      catalogStore: stores.catalog,
      libraryStore: stores.library,
    },
  })
  const workspace = connectCliWorkspace(stores)

  return {
    ...core,
    close: async () => {
      await Promise.resolve()
    },
    stores,
    workspace,
  }
}

export type CliAppContext = ReturnType<typeof createCliApp>

function connectCliWorkspace(stores: CliStoreInstances) {
  const { activeSessionId } = stores.cli.typedStore.values

  // Active session is CLI-local state.
  return {
    clearActiveSessionId(): void {
      activeSessionId.set(null)
    },
    getActiveSessionId(): string | undefined {
      const sessionId = activeSessionId.get()
      return sessionId === null || sessionId.trim() === '' ? undefined : sessionId
    },
    setActiveSessionId(sessionId: string): void {
      activeSessionId.set(sessionId)
    },
  }
}
