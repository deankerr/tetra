import { Catalog, Prompts, RunConfigs, Runs, Transcripts } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { createCliStores } from '@tetra/stores'
import type { CliStores } from '@tetra/stores'

export function bootstrap() {
  const stores = createCliStores()
  const library = connectLibrary(stores)
  const catalog = connectCatalog(stores)
  const workspace = connectCliWorkspace(stores)

  return {
    ...library,
    catalog,
    catalogStore: stores.catalog.typedStore,
    cliStore: stores.cli.typedStore,
    close: async () => {
      await Promise.resolve()
    },
    typedIndexes: stores.library.typedIndexes,
    typedStore: stores.library.typedStore,
    workspace,
  }
}

function connectLibrary(stores: CliStores) {
  const { typedIndexes } = stores.library
  const { typedStore } = stores.library

  // RunConfigs comes first so Prompts can delegate prompt unlinking to it.
  const runConfigs = new RunConfigs({ typedStore })
  const prompts = new Prompts({ runConfigs, typedStore })
  const transcripts = new Transcripts({ runConfigs, typedIndexes, typedStore })
  const runs = new Runs({
    credentials: credentialStore,
    prompts,
    runConfigs,
    transcripts,
    typedStore,
  })

  return {
    prompts,
    runConfigs,
    runs,
    transcripts,
  }
}

function connectCatalog(stores: CliStores) {
  return new Catalog({ typedStore: stores.catalog.typedStore })
}

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
