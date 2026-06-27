import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { CredentialsStore } from '@tetra/credentials'
import type { RunConfig } from '@tetra/schemas/library'
import type { LanguageModel } from 'ai'

export interface LanguageModelResolver {
  resolve(args: { config: RunConfig; credentials: CredentialsStore }): LanguageModel
}

export const openRouterLanguageModelResolver: LanguageModelResolver = {
  resolve: ({ config, credentials }) => {
    const openrouterApiKey = credentials.require('OPENROUTER_API_KEY')

    return createOpenRouter({ apiKey: openrouterApiKey })(config.modelId)
  },
}
