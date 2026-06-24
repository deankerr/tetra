import { createCoreModules } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'

import { createCliStoreInstances } from './stores/cli'
import type { CliStoreInstances } from './stores/cli'

export function bootstrap() {
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

export type CliAppContext = ReturnType<typeof bootstrap>

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
