import { z } from 'zod'

// --- Session Config ---

export const sessionConfigSchema = z.object({
  maxMessages: z.number().int().positive().optional(),
  modelId: z.string().min(1),
  systemPrompt: z.string().optional(),

  // Passthrough to provider via providerOptions.openrouter.
  // Includes standard LLM params (temperature, max_tokens, top_p, etc.)
  // and OpenRouter-specific options (transforms, reasoning, models, etc.).
  // We don't validate — the provider API does.
  // oxlint-disable-next-line no-explicit-any -- JSON passthrough for provider API
  providerOptions: z.record(z.string(), z.json()).optional(),
})

// --- Types ---

export type SessionConfig = z.infer<typeof sessionConfigSchema>

// --- Defaults ---

export const DEFAULT_CONFIG: SessionConfig = {
  modelId: 'openai/gpt-4o-mini',
  providerOptions: {
    max_tokens: 800,
    temperature: 0.7,
  },
  systemPrompt:
    'You are a concise assistant. Answer directly and prefer short, concrete responses.',
}
