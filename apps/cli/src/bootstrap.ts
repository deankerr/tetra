import { Catalog, Prompts, RunConfigs, Runs, Transcripts } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { startCliStoreHost } from '@tetra/stores'
import type { CliStoreHost, StoreRuntime } from '@tetra/stores'

// oxlint-disable-next-line dot-notation -- env var name has underscores, bracket notation is clearer
export const WORKER_URL = process.env['TETRA_WORKER_URL'] ?? 'ws://localhost:8787'
const SYNC_URL = `${WORKER_URL}/tetra`

export type BootstrapMode = 'local' | 'sync'
type CliRuntime = StoreRuntime<CliStoreHost>

export async function bootstrap(mode: BootstrapMode) {
  if (mode === 'sync') {
    console.log(`Sync URL: ${SYNC_URL}`)
  }

  const runtime = await startCliStoreHost(mode, { syncUrl: SYNC_URL })
  const library = connectLibrary(runtime)
  const catalog = connectCatalog(runtime)
  const close = runtime.close.bind(runtime)
  const workspace = connectCliWorkspace(runtime)

  return {
    ...library,
    catalog,
    catalogStore: runtime.host.catalog.typedStore,
    cliStore: runtime.host.cli.typedStore,
    close,
    typedIndexes: runtime.host.library.typedIndexes,
    typedStore: runtime.host.library.typedStore,
    workspace,
  }
}

function connectLibrary(runtime: CliRuntime) {
  const { typedIndexes } = runtime.host.library
  const { typedStore } = runtime.host.library

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

function connectCatalog(runtime: CliRuntime) {
  return new Catalog({ typedStore: runtime.host.catalog.typedStore })
}

function connectCliWorkspace(runtime: CliRuntime) {
  const { activeSessionId } = runtime.host.cli.typedStore.values

  // Active session is CLI-local state even when the library store is synced.
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
