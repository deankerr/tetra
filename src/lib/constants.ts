import type { SessionConfig } from '@/lib/shared/session-config'

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  modelId: 'openai/gpt-5.4-nano',
  providerOptions: {
    max_tokens: 1024,
    temperature: 0.5,
  },
  systemPrompt: 'Be concise.',
}
