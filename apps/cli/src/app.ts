import { createCoreModules } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'

import { createCliStoreRuntime } from './store'
import type { CliStoreInstances } from './store'

export interface CliAppOptions {
  syncEnabled?: boolean
}

export async function createCliApp(options: CliAppOptions = {}) {
  const runtime = await createCliStoreRuntime({ syncEnabled: options.syncEnabled })
  const { stores } = runtime
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
      await runtime.close()
    },
    stores,
    workspace,
  }
}

export type CliAppContext = Awaited<ReturnType<typeof createCliApp>>

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
