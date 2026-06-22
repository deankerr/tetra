import type { CatalogRows, CatalogTypedStore } from '@tetra/stores'
import { z } from 'zod'

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
  private readonly typedStore: CatalogTypedStore

  constructor({ typedStore }: { typedStore: CatalogTypedStore }) {
    this.typedStore = typedStore
  }

  async refresh(args: { force?: boolean } = {}): Promise<void> {
    const { lastRefreshed } = this.typedStore.values
    const refreshedAt = lastRefreshed.get()
    const isStale = refreshedAt === null || Date.now() - refreshedAt > STALE_MS
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
    const models: CatalogRows['languageModels'][] = data.map((model) => {
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

    // Publish the catalog replacement and refresh timestamp as one TinyBase event.
    const incomingIds = new Set(models.map((m) => m.id))
    this.typedStore.transaction(() => {
      for (const existingId of this.typedStore.tables.languageModels.getRowIds()) {
        if (!incomingIds.has(existingId)) {
          this.typedStore.tables.languageModels.deleteRow(existingId)
        }
      }
      for (const { id, ...record } of models) {
        const existing = this.typedStore.tables.languageModels.getEntity(id)
        this.typedStore.tables.languageModels.setRow(id, {
          ...record,
          createdAt: existing?.createdAt ?? record.createdAt,
        })
      }
      lastRefreshed.set(now)
    })
  }
}
