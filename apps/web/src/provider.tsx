import type { Catalog, Store, TetraDb } from '@tetra/core'
import { Runs, createCoreModules, createTetraDb } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { Toaster } from '@tetra/ui/components/ui/sonner'
import { createContext, useContext, useState } from 'react'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import { Provider } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

export interface TetraAppContext {
  catalog: Catalog
  runs: Runs
  store: Store
}

const TetraContext = createContext<TetraAppContext | null>(null)

export function useTetra(): TetraAppContext {
  const ctx = useContext(TetraContext)
  if (ctx === null) {
    throw new Error('useTetra must be used within TetraProvider')
  }
  return ctx
}

interface TetraApp {
  catalog: Catalog
  db: TetraDb
  runs: Runs
  store: Store
}

export function TetraProvider({ children }: { children: React.ReactNode }) {
  const [tetra] = useState<TetraApp>(() => {
    const db = createTetraDb()
    const core = createCoreModules(db)
    const runs = new Runs(core.store, credentialStore)
    return { catalog: core.catalog, db, runs, store: core.store }
  })

  // TinyBase requires untyped store/indexes/persister for the Provider component.
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimeStore = tetra.db.store as unknown as TinyStore
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimeIndexes = tetra.db.indexes.raw as unknown as TinyIndexes

  return (
    <TetraContext
      value={{
        catalog: tetra.catalog,
        runs: tetra.runs,
        store: tetra.store,
      }}
    >
      <Provider indexes={runtimeIndexes} store={runtimeStore}>
        {children}
        <Inspector />
        <Toaster richColors />
      </Provider>
    </TetraContext>
  )
}
