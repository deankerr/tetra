import { getHlcFunctions } from 'tinybase/common'
import type { Row, TablesSchema, ValuesSchema } from 'tinybase/with-schemas'
import { z } from 'zod'

// Domain enums
export const MessageRole = z.enum(['assistant', 'user'])
export type MessageRole = z.infer<typeof MessageRole>

export const RequestStatus = z.enum(['cancelled', 'completed', 'error', 'streaming'])
export type RequestStatus = z.infer<typeof RequestStatus>

// Model config — validated at execution boundary
export const ModelConfig = z.object({
  maxMessages: z.number().int().positive().optional(),
  modelId: z.string(),
  providerOptions: z.record(z.string(), z.json()).optional(),
  systemPrompt: z.string().optional(),
  toolIds: z.array(z.string()).optional(),
})
export type ModelConfig = z.infer<typeof ModelConfig>

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  modelId: 'anthropic/claude-sonnet-4.5',
  providerOptions: {
    max_tokens: 10_240,
    reasoning: {
      enabled: true,
    },
  },
  systemPrompt: 'Use Markdown sparingly. Favour paragraphs over bulleted lists.',
}

// Aggregated accounting stored on each step — shape produced by resolveAccounting() in runner.ts.
export const StepAccounting = z.object({
  backendProvider: z.string(),
  cost: z.object({
    completion: z.number().nullable(),
    isByok: z.boolean(),
    prompt: z.number().nullable(),
    total: z.number().nullable(),
  }),
  generationId: z.string(),
  requestedModel: z.string(),
  servedModel: z.string(),
  tokens: z.object({
    audioIn: z.number(),
    audioOut: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
    imageOut: z.number(),
    input: z.number(),
    output: z.number(),
    reasoning: z.number(),
    text: z.number(),
    total: z.number(),
    videoIn: z.number(),
  }),
})
export type StepAccounting = z.infer<typeof StepAccounting>

// TinyBase table schemas
export const tablesSchema = {
  languageModels: {
    contextLength: { default: 0, type: 'number' },
    createdAt: { default: 0, type: 'number' },
    inputModalities: { default: '', type: 'string' },
    name: { default: '', type: 'string' },
    outputModalities: { default: '', type: 'string' },
    provider: { default: '', type: 'string' },
    providerName: { default: '', type: 'string' },
    supportedParameters: { default: '', type: 'string' },
  },
  messages: {
    createdAt: { default: 0, type: 'number' },
    parts: { default: [], type: 'array' },
    role: { default: 'user', type: 'string' },
    sessionId: { default: '', type: 'string' },
    updatedAt: { default: 0, type: 'number' },
  },
  requests: {
    assistantMessageId: { default: '', type: 'string' },
    completedAt: { default: 0, type: 'number' },
    config: { default: {}, type: 'object' },
    createdAt: { default: 0, type: 'number' },
    errorMessage: { default: '', type: 'string' },
    sessionId: { default: '', type: 'string' },
    status: { default: 'streaming', type: 'string' },
    totalUsage: { default: {}, type: 'object' },
  },
  sessions: {
    config: { default: {}, type: 'object' },
    createdAt: { default: 0, type: 'number' },
    title: { default: '', type: 'string' },
    updatedAt: { default: 0, type: 'number' },
  },
  steps: {
    accounting: { default: {}, type: 'object' },
    createdAt: { default: 0, type: 'number' },
    finishReason: { default: '', type: 'string' },
    messageId: { default: '', type: 'string' },
    requestId: { default: '', type: 'string' },
    sessionId: { default: '', type: 'string' },
    stepNumber: { default: 0, type: 'number' },
  },
} as const satisfies TablesSchema

export const valuesSchema = {
  catalogLastRefreshed: { default: 0, type: 'number' },
} as const satisfies ValuesSchema

export type TetraSchemas = [typeof tablesSchema, typeof valuesSchema]

// Domain types derived from the schema — id is the TinyBase row key, not a stored cell
type Schema = typeof tablesSchema
export type LanguageModel = Row<Schema, 'languageModels'> & { id: string }
export type Session = Row<Schema, 'sessions'> & { id: string }
export type Message = Row<Schema, 'messages'> & { id: string }
export type Request = Row<Schema, 'requests'> & { id: string }
export type Step = Row<Schema, 'steps'> & { id: string }

// HLC ID generators — single monotonic counter across all entity types
const [getNextHlc] = getHlcFunctions()
const prefixed = (prefix: string) => () => `${prefix}_${getNextHlc()}`

export const generateId = {
  message: prefixed('mesg'),
  request: prefixed('rqst'),
  session: prefixed('sess'),
  step: prefixed('step'),
}
