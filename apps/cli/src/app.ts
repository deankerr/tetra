import { createCoreModules } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import type { CredentialsStore } from '@tetra/credentials'

import { createCliStoreRuntime } from './store'
import type { CliStores } from './store'

export interface PersistentCliAppContextOptions {
  syncEnabled?: boolean
}

export interface CliAppContextOptions {
  close?: () => Promise<void>
  credentials?: CredentialsStore
  stores: CliStores
}

async function closeInMemoryCliApp(): Promise<void> {
  // In-memory CLI apps have no persistence or sync handles to flush.
  await Promise.resolve()
}

export async function createPersistentCliAppContext(options: PersistentCliAppContextOptions = {}) {
  const runtime = await createCliStoreRuntime({ syncEnabled: options.syncEnabled })
  return createCliAppContext({
    close: async () => {
      await runtime.close()
    },
    stores: runtime.stores,
  })
}

export function createCliAppContext({
  close = closeInMemoryCliApp,
  credentials = credentialStore,
  stores,
}: CliAppContextOptions) {
  const core = createCoreModules({
    credentials,
    stores: {
      catalogStore: stores.catalog,
      libraryStore: stores.library,
    },
  })
  const workspace = connectCliWorkspace(stores)

  return {
    ...core,
    close,
    stores,
    workspace,
  }
}

export type CliAppContext = ReturnType<typeof createCliAppContext>

function connectCliWorkspace(stores: CliStores) {
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
