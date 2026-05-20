import { z } from 'zod'

import type { Accessors } from '#accessors'
import type { Rows } from '#db'

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

export class Catalog {
  private readonly accessors: Accessors
  private readonly source: CatalogSource

  constructor(accessors: Accessors, source: CatalogSource = createOpenRouterCatalogSource()) {
    this.accessors = accessors
    this.source = source
  }

  async refresh(args: { force?: boolean } = {}): Promise<void> {
    const lastRefreshAt = this.accessors.languageModels.lastCatalogRefreshAt()
    const isStale = !lastRefreshAt || Date.now() - lastRefreshAt > STALE_MS
    if (args.force !== true && !isStale) {
      return
    }

    const models = await this.source.listLanguageModels()
    this.accessors.languageModels.replaceAll(models)
    this.accessors.languageModels.markCatalogRefreshed()
  }
}
