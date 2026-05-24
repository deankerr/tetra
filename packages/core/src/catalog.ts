import { z } from 'zod'

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

export class Catalog {
  private readonly db: TetraDb

  constructor(db: TetraDb) {
    this.db = db
  }

  async refresh(args: { force?: boolean } = {}): Promise<void> {
    const { catalogLastRefreshed } = this.db.values
    const lastRefreshed = catalogLastRefreshed.get()
    const isStale = lastRefreshed === 0 || Date.now() - lastRefreshed > STALE_MS
    if (args.force !== true && !isStale) {
      return
    }

    // Fetch and parse the OpenRouter model list.
    const response = await fetch(OPENROUTER_MODELS_URL)
    if (!response.ok) {
      throw new Error(`OpenRouter models fetch failed: ${response.status} ${response.statusText}`)
    }

    const { data } = OpenRouterModelsResponse.parse(await response.json())
    const now = Date.now()
    const models: Rows.LanguageModel[] = data.map((model) => {
      const [provider = ''] = model.id.split('/')
      const colonIndex = model.name.indexOf(':')
      const rawProviderName = colonIndex > 0 ? model.name.slice(0, colonIndex).trim() : ''
      const name = colonIndex > 0 ? model.name.slice(colonIndex + 1).trim() : model.name

      return {
        contextLength: model.context_length,
        createdAt: now,
        id: model.id,
        inputModalities: model.architecture.input_modalities,
        name,
        outputModalities: model.architecture.output_modalities,
        provider,
        providerName: rawProviderName || provider,
        supportedParameters: model.supported_parameters,
        updatedAt: now,
        upstreamCreatedAt: model.created,
      }
    })

    // Replace the full catalog in one transaction: remove stale entries, upsert incoming.
    const incomingIds = new Set(models.map((m) => m.id))
    this.db.transaction(() => {
      for (const existingId of this.db.tables.languageModels.getRowIds()) {
        if (!incomingIds.has(existingId)) {
          this.db.tables.languageModels.deleteRow(existingId)
        }
      }
      for (const { id, ...record } of models) {
        const existing = this.db.tables.languageModels.getEntity(id)
        this.db.tables.languageModels.setRow(id, {
          ...record,
          createdAt: existing?.createdAt ?? record.createdAt,
        })
      }
    })

    catalogLastRefreshed.set(now)
  }
}
