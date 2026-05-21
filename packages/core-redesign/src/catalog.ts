import { z } from 'zod'

import { LanguageModelRecord } from '#db'
import type { Rows, TetraDb } from '#db'

const STALE_MS = 60 * 60 * 1000
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'

const OpenRouterModel = z.object({
  architecture: z.object({
    input_modalities: z.array(z.string()),
    output_modalities: z.array(z.string()),
  }),
  context_length: z.number(),
  created: z.number(),
  id: z.string(),
  name: z.string(),
  supported_parameters: z.array(z.string()),
})

const OpenRouterModelsResponse = z.object({
  data: z.array(OpenRouterModel),
})

export interface CatalogSource {
  listLanguageModels(): Promise<Rows.LanguageModel[]>
}

export function createOpenRouterCatalogSource(): CatalogSource {
  return {
    async listLanguageModels(): Promise<Rows.LanguageModel[]> {
      const response = await fetch(OPENROUTER_MODELS_URL)
      if (!response.ok) {
        throw new Error(`OpenRouter models fetch failed: ${response.status} ${response.statusText}`)
      }

      const json = OpenRouterModelsResponse.parse(await response.json())
      return json.data.map((model) => {
        const [provider = ''] = model.id.split('/')
        const colonIndex = model.name.indexOf(':')
        const rawProviderName = colonIndex > 0 ? model.name.slice(0, colonIndex).trim() : ''
        const name = colonIndex > 0 ? model.name.slice(colonIndex + 1).trim() : model.name

        return {
          contextLength: model.context_length,
          createdAt: model.created,
          id: model.id,
          inputModalities: model.architecture.input_modalities,
          name,
          outputModalities: model.architecture.output_modalities,
          provider,
          providerName: rawProviderName || provider,
          supportedParameters: model.supported_parameters,
        }
      })
    },
  }
}

// Replaces the full language model catalog in one transaction: removes stale entries, upserts new ones.
function replaceAll(db: TetraDb, models: Rows.LanguageModel[]): void {
  const incomingIds = new Set(models.map((m) => m.id))

  db.store.transaction(() => {
    for (const existingId of db.store.getRowIds('languageModels')) {
      if (!incomingIds.has(existingId)) {
        db.store.delRow('languageModels', existingId)
      }
    }

    for (const model of models) {
      const { id, ...record } = model
      db.store.setRow('languageModels', id, LanguageModelRecord.parse(record))
    }
  })
}

function markRefreshed(db: TetraDb): void {
  db.store.setValue('catalogLastRefreshed', Date.now())
}

function lastRefreshAt(db: TetraDb): number {
  return db.store.getValue('catalogLastRefreshed')
}

export class Catalog {
  private readonly db: TetraDb
  private readonly source: CatalogSource

  constructor(db: TetraDb, source: CatalogSource = createOpenRouterCatalogSource()) {
    this.db = db
    this.source = source
  }

  async refresh(args: { force?: boolean } = {}): Promise<void> {
    const isStale = !lastRefreshAt(this.db) || Date.now() - lastRefreshAt(this.db) > STALE_MS
    if (args.force !== true && !isStale) {
      return
    }

    const models = await this.source.listLanguageModels()
    replaceAll(this.db, models)
    markRefreshed(this.db)
  }
}
