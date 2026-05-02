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
  systemPrompt: z.string().optional(),

  // Passthrough to provider via providerOptions.
  // Includes standard LLM params and provider-specific options.
  // oxlint-disable-next-line no-explicit-any -- JSON passthrough for provider API
  providerOptions: z.record(z.string(), z.json()).optional(),
})

export type SessionConfig = z.infer<typeof sessionConfigSchema>

export const truncate = (text: string, maxLength = 128) => {
  const normalized = text.replaceAll(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength - 1)}…`
}
