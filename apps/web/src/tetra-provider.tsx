import { createCoreModules } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { useMemo } from 'react'

import { TetraContext } from '@/tetra-context'
import { useWebStoreInstances } from '@/tinybase-provider'

export function TetraProvider({ children }: { children: React.ReactNode }) {
  const stores = useWebStoreInstances()

  // Core services are stable for the lifetime of the browser stores.
  const core = useMemo(
    () =>
      createCoreModules({
        credentials: credentialStore,
        stores: {
          catalogStore: stores.catalog,
          libraryStore: stores.library,
        },
      }),
    [stores],
  )

  return (
    <TetraContext
      value={{
        modelCatalog: core.modelCatalog,
        prompts: core.prompts,
        runConfigs: core.runConfigs,
        runs: core.runs,
        stores,
        transcripts: core.transcripts,
      }}
    >
      {children}
    </TetraContext>
  )
}
