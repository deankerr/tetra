import { Catalog, Prompts, RunConfigs, Runs, Transcripts } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import type { WebStoreHost } from '@tetra/stores/web'
import { useMemo } from 'react'

import { TetraContext } from '@/tetra-context'
import { useWebStoreHost } from '@/tinybase-provider'

function createTetraApp(host: WebStoreHost) {
  // Core modules share the synced library store and its indexes.
  const libraryStore = host.library.typedStore
  const libraryIndexes = host.library.typedIndexes
  const runConfigs = new RunConfigs({ typedStore: libraryStore })
  const prompts = new Prompts({ runConfigs, typedStore: libraryStore })
  const transcripts = new Transcripts({
    runConfigs,
    typedIndexes: libraryIndexes,
    typedStore: libraryStore,
  })

  // Catalog and web state live outside the synced library store.
  const catalogStore = host.catalog.typedStore
  const webStore = host.web.typedStore
  const catalog = new Catalog({ typedStore: catalogStore })
  const runs = new Runs({
    credentials: credentialStore,
    prompts,
    runConfigs,
    transcripts,
    typedStore: libraryStore,
  })

  return { catalog, catalogStore, libraryStore, prompts, runConfigs, runs, transcripts, webStore }
}

export function TetraProvider({ children }: { children: React.ReactNode }) {
  const host = useWebStoreHost()

  // Core services are stable for the lifetime of the browser store host.
  const tetra = useMemo(() => createTetraApp(host), [host])

  return (
    <TetraContext
      value={{
        catalog: tetra.catalog,
        catalogStore: tetra.catalogStore,
        libraryStore: tetra.libraryStore,
        prompts: tetra.prompts,
        runConfigs: tetra.runConfigs,
        runs: tetra.runs,
        transcripts: tetra.transcripts,
        webStore: tetra.webStore,
      }}
    >
      {children}
    </TetraContext>
  )
}
