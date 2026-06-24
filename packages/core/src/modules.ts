import type { CredentialsStore } from '@tetra/credentials'
import type { CatalogStoreInstance } from '@tetra/stores/catalog'
import type { LibraryStoreInstance } from '@tetra/stores/library'

import { ModelCatalog } from '#catalog'
import { Prompts } from '#prompts'
import { RunConfigs } from '#run-configs'
import { Runs } from '#runtime'
import type { LanguageModelResolver } from '#runtime/language-model-resolver.ts'
import { Transcripts } from '#transcripts'

export interface CoreModules {
  modelCatalog: ModelCatalog
  prompts: Prompts
  runConfigs: RunConfigs
  runs: Runs
  transcripts: Transcripts
}

export function createCoreModules({
  credentials,
  modelResolver,
  stores,
}: {
  credentials: CredentialsStore
  modelResolver?: LanguageModelResolver
  stores: {
    catalogStore: CatalogStoreInstance
    libraryStore: LibraryStoreInstance
  }
}): CoreModules {
  const { catalogStore, libraryStore } = stores

  // Core modules share the library store and compose around run config resolution.
  const runConfigs = new RunConfigs({ libraryStore })
  const prompts = new Prompts({ libraryStore, runConfigs })
  const transcripts = new Transcripts({ libraryStore, runConfigs })
  const modelCatalog = new ModelCatalog({ catalogStore })
  const runs = new Runs({
    credentials,
    libraryStore,
    modelResolver,
    prompts,
    runConfigs,
    transcripts,
  })

  return { modelCatalog, prompts, runConfigs, runs, transcripts }
}
