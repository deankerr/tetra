import { z } from 'zod'

// --- Schema ---

export const inferenceConfigSchema = z
  .object({
    maxOutputTokens: z.number().optional(),
    modelId: z.string().min(1),
    systemPrompt: z.string().optional(),
    temperature: z.number().optional(),
  })
  .loose()

// --- Types ---

export type InferenceConfig = z.infer<typeof inferenceConfigSchema>

// --- Defaults ---

export const DEFAULT_CONFIG: InferenceConfig = {
  maxOutputTokens: 800,
  modelId: 'openai/gpt-4o-mini',
  systemPrompt:
    'You are a concise assistant. Answer directly and prefer short, concrete responses.',
  temperature: 0.7,
}

// --- Parse ---

export const parseConfig = (raw: string): InferenceConfig | null => {
  if (!raw) {
    return null
  }
  try {
    return inferenceConfigSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}
