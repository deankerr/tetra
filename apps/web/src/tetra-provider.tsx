import { Catalog, Prompts, RunConfigs, Runs, Transcripts } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { tetraStoreSchema, tetraIndexIds } from '@tetra/store-schema'
import type { TetraRawIndexes, TetraRawStore } from '@tetra/store-schema'
import { bindIndexes, bindStore } from '@tetra/tinybase-schema'
import { useMemo } from 'react'

import { tinybase } from '@/lib/tinybase'
import { TetraContext } from '@/tetra-context'

function createTetraApp(rawStore: TetraRawStore, rawIndexes: TetraRawIndexes) {
  // Bind the raw TinyBase objects to Tetra's typed APIs at the app boundary.
  const typedStore = bindStore(rawStore, tetraStoreSchema.tables, tetraStoreSchema.values)
  const typedIndexes = bindIndexes(rawIndexes, tetraIndexIds)

  // Core modules share one typed TinyBase context. RunConfigs comes first so
  // Prompts can delegate prompt unlinking to it.
  const runConfigs = new RunConfigs({ typedStore })
  const prompts = new Prompts({ runConfigs, typedStore })
  const transcripts = new Transcripts({ runConfigs, typedIndexes, typedStore })
  const catalog = new Catalog({ typedStore })
  const runs = new Runs({
    credentials: credentialStore,
    prompts,
    runConfigs,
    transcripts,
    typedStore,
  })

  return { catalog, prompts, runConfigs, runs, transcripts, typedStore }
}

export function TetraProvider({ children }: { children: React.ReactNode }) {
  // Tetra app modules depend on the outer TinyBase provider being ready.
  const rawStore = tinybase.useStore()
  const rawIndexes = tinybase.useIndexes()

  // Bind Tetra's typed APIs and core modules around the provided TinyBase objects.
  const tetra = useMemo(() => {
    if (rawStore === undefined || rawIndexes === undefined) {
      return null
    }

    return createTetraApp(rawStore, rawIndexes)
  }, [rawIndexes, rawStore])

  if (tetra === null) {
    return null
  }

  return (
    <TetraContext
      value={{
        catalog: tetra.catalog,
        prompts: tetra.prompts,
        runConfigs: tetra.runConfigs,
        runs: tetra.runs,
        transcripts: tetra.transcripts,
        typedStore: tetra.typedStore,
      }}
    >
      {children}
    </TetraContext>
  )
}
