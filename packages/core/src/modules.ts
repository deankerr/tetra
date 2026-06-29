import type { CredentialsStore } from '@tetra/credentials'
import type { CatalogDb } from '@tetra/schemas/catalog'
import type { LibraryDb } from '@tetra/schemas/library'

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
    catalog: CatalogDb
    library: LibraryDb
  }
}): CoreModules {
  const { catalog, library } = stores

  // Core modules share the library store and compose around run config resolution.
  const runConfigs = new RunConfigs({ library })
  const prompts = new Prompts({ library, runConfigs })
  const transcripts = new Transcripts({ library, runConfigs })
  const modelCatalog = new ModelCatalog({ catalog })
  const runs = new Runs({
    credentials,
    library,
    modelResolver,
    prompts,
    runConfigs,
    transcripts,
  })

  return { modelCatalog, prompts, runConfigs, runs, transcripts }
}
