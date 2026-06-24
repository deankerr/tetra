import { Catalog, Prompts, RunConfigs, Runs, Transcripts } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import type { WebStores } from '@tetra/stores/web'
import { useMemo } from 'react'

import { TetraContext } from '@/tetra-context'
import { useWebStores } from '@/tinybase-provider'

function createTetraApp(stores: WebStores) {
  // Core modules share the library store and its indexes.
  const libraryStore = stores.library.typedStore
  const libraryIndexes = stores.library.typedIndexes
  const runConfigs = new RunConfigs({ typedStore: libraryStore })
  const prompts = new Prompts({ runConfigs, typedStore: libraryStore })
  const transcripts = new Transcripts({
    runConfigs,
    typedIndexes: libraryIndexes,
    typedStore: libraryStore,
  })

  // Catalog and web state live outside the synced library store.
  const catalogStore = stores.catalog.typedStore
  const webStore = stores.web.typedStore
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
  const stores = useWebStores()

  // Core services are stable for the lifetime of the browser stores.
  const tetra = useMemo(() => createTetraApp(stores), [stores])

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
