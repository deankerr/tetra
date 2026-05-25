import { Catalog, Helpers, Runs, tetraDbDefinition } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import type { TinybaseSchemasFor } from '@tetra/tinybase-schema'
import { bindTinybaseIndexes, bindTinybaseStore } from '@tetra/tinybase-schema'
import { useMemo } from 'react'
import type { Indexes as RawIndexes } from 'tinybase/indexes/with-schemas'
import type { Store as RawStore } from 'tinybase/store/with-schemas'

import { TetraContext } from '@/tetra-context'
import { tinybase } from '@/tetra-tinybase-react'

function createTetraApp(
  rawStore: RawStore<TinybaseSchemasFor<typeof tetraDbDefinition>>,
  rawIndexes: RawIndexes<TinybaseSchemasFor<typeof tetraDbDefinition>>,
) {
  // Bind the raw TinyBase objects to Tetra's typed APIs at the app boundary.
  const typedStore = bindTinybaseStore(rawStore, tetraDbDefinition.tables, tetraDbDefinition.values)
  const typedIndexes = bindTinybaseIndexes(rawIndexes, tetraDbDefinition.indexes)
  const context = { rawIndexes, rawStore, typedIndexes, typedStore }

  // Core modules share one typed TinyBase context.
  const helpers = new Helpers(context)
  const catalog = new Catalog(context)
  const runs = new Runs(helpers, credentialStore)

  return { catalog, helpers, runs }
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
        helpers: tetra.helpers,
        runs: tetra.runs,
      }}
    >
      {children}
    </TetraContext>
  )
}
