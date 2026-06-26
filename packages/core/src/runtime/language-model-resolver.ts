import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { CredentialsStore } from '@tetra/credentials'
import type { RunConfig } from '@tetra/schemas/library'
import type { LanguageModel } from 'ai'

export interface LanguageModelResolver {
  resolve(args: { config: RunConfig; credentials: CredentialsStore }): LanguageModel
}

export const openRouterLanguageModelResolver: LanguageModelResolver = {
  resolve: ({ config, credentials }) => {
    const openrouterApiKey = credentials.get('OPENROUTER_API_KEY').trim()
    if (openrouterApiKey === '') {
      throw new Error('OPENROUTER_API_KEY is required for model inference')
    }

    return createOpenRouter({ apiKey: openrouterApiKey })(config.modelId)
  },
}
