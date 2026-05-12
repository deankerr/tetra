import { customAlphabet } from 'nanoid'
import { z } from 'zod'

const ID_LENGTH = 12
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const generate = customAlphabet(alphabet, ID_LENGTH)

const prefixed = (prefix: string) => () => `${prefix}_${generate()}`

export const generateId = {
  message: prefixed('mesg'),
  request: prefixed('rqst'),
  session: prefixed('sess'),
}

export const sessionConfigSchema = z.object({
  maxMessages: z.number().int().positive().optional(),
  modelId: z.string().min(1),
  // Passthrough to provider via providerOptions.
  // Includes standard LLM params and provider-specific options.
  providerOptions: z.record(z.string(), z.json()).optional(),
  systemPrompt: z.string().optional(),
})

export type SessionConfig = z.infer<typeof sessionConfigSchema>

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  modelId: 'openai/gpt-5.4-nano',
  providerOptions: {
    max_tokens: 10_240,
    temperature: 0.5,
  },
  systemPrompt: 'Be concise.',
}
