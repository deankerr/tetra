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
  modelId: z.string().min(1),
  providerOptions: z.record(z.string(), z.unknown()).optional(),
  systemPrompt: z.string().optional(),
})
export type ModelConfig = z.infer<typeof ModelConfig>

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  modelId: 'anthropic/claude-sonnet-4-5',
  systemPrompt: 'Use Markdown sparingly. Favour paragraphs over bulleted lists.',
}

// TinyBase table schemas — cell shape definitions (data shape is a model concern)
export const tablesSchema = {
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
    content: { default: [], type: 'array' },
    createdAt: { default: 0, type: 'number' },
    finishReason: { default: '', type: 'string' },
    messageId: { default: '', type: 'string' },
    model: { default: {}, type: 'object' },
    providerMetadata: { default: {}, type: 'object' },
    requestId: { default: '', type: 'string' },
    responseMessages: { default: [], type: 'array' },
    sessionId: { default: '', type: 'string' },
    stepNumber: { default: 0, type: 'number' },
    usage: { default: {}, type: 'object' },
  },
} as const satisfies TablesSchema

export const valuesSchema = {} as const satisfies ValuesSchema

// Domain types derived from the schema — id is the TinyBase row key, not a stored cell
type Schema = typeof tablesSchema
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
