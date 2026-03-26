import type { SessionConfig } from '@tetra/runtime'

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  modelId: 'openai/gpt-5.4-nano',
  providerOptions: {
    max_tokens: 10_240,
    temperature: 0.5,
  },
  systemPrompt: 'Be concise.',
}
