import { z } from 'zod'

export const requestConfigSchema = z.object({
  maxMessages: z.number().int().positive().optional(),
  modelId: z.string().min(1),
  // Passthrough to provider via providerOptions.
  // Includes standard LLM params and provider-specific options.
  providerOptions: z.record(z.string(), z.json()).optional(),
  systemPrompt: z.string().optional(),
})

export type RequestConfig = z.infer<typeof requestConfigSchema>

export const DEFAULT_REQUEST_CONFIG: RequestConfig = {
  modelId: 'openai/gpt-5.4-nano',
  providerOptions: {
    max_tokens: 10_240,
    temperature: 0.5,
  },
  systemPrompt: 'Be concise.',
}

export const parseRequestConfig = (raw: unknown): RequestConfig => requestConfigSchema.parse(raw)
