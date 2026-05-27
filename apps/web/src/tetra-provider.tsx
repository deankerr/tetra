import { Catalog, Helpers, Runs } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { tetraStoreSchema, tetraIndexIds } from '@tetra/store-schema'
import type { TetraRawIndexes, TetraRawStore } from '@tetra/store-schema'
import { bindIndexes, bindStore } from '@tetra/tinybase-schema'
import { useEffect, useMemo } from 'react'

import { tinybase, useTinyBaseRuntime } from '@/lib/tinybase'
import { TetraContext } from '@/tetra-context'

function createTetraApp(rawStore: TetraRawStore, rawIndexes: TetraRawIndexes) {
  // Bind the raw TinyBase objects to Tetra's typed APIs at the app boundary.
  const typedStore = bindStore(rawStore, tetraStoreSchema.tables, tetraStoreSchema.values)
  const typedIndexes = bindIndexes(rawIndexes, tetraIndexIds)
  const context = { rawIndexes, rawStore, typedIndexes, typedStore }

  // Core modules share one typed TinyBase context.
  const helpers = new Helpers(context)
  const catalog = new Catalog(context)
  const runs = new Runs(helpers, credentialStore)

  return { catalog, helpers, runs }
}

export function TetraProvider({ children }: { children: React.ReactNode }) {
  const { catalogReady } = useTinyBaseRuntime()

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

  useEffect(() => {
    if (catalogReady && tetra !== null) {
      void tetra.catalog.refresh()
    }
  }, [catalogReady, tetra])

  if (tetra === null) {
    return null
  }

  return (
    <TetraContext
      value={{
        catalog: tetra.catalog,
        helpers: tetra.helpers,
        runs: tetra.runs,
      }}
    >
      {children}
    </TetraContext>
  )
}
