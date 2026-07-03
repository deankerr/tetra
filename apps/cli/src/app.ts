import { createCoreModules } from '@tetra/core'
import { createCredentialReader } from '@tetra/credentials'
import type { CredentialReader } from '@tetra/credentials'

import { createCliStoreRuntime } from './store'
import type { CliStores } from './store'

export interface CliAppContextOptions {
  close?: () => Promise<void>
  credentials?: CredentialReader
  stores: CliStores
}

// The CLI reads credentials straight from the process environment.
const envCredentials = createCredentialReader((id) => process.env[id])

async function closeInMemoryCliApp(): Promise<void> {
  // In-memory CLI apps have no persistence handles to flush.
  await Promise.resolve()
}

export async function createPersistentCliAppContext() {
  const runtime = await createCliStoreRuntime()
  return createCliAppContext({
    close: async () => {
      await runtime.close()
    },
    stores: runtime.stores,
  })
}

export function createCliAppContext({
  close = closeInMemoryCliApp,
  credentials = envCredentials,
  stores,
}: CliAppContextOptions) {
  const core = createCoreModules({
    credentials,
    stores: {
      catalog: stores.catalog,
      library: stores.library,
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
  const { activeSessionId } = stores.cli.values

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
