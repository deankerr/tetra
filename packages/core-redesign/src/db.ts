import type { JSONObject } from '@ai-sdk/provider'
import type { UIMessage } from 'ai'
import { createIndexes } from 'tinybase/indexes/with-schemas'
import { createMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import type { MergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createStore as createTinybaseStore } from 'tinybase/store/with-schemas'
import type { Store } from 'tinybase/store/with-schemas'
import type { Row, TablesSchema, ValuesSchema } from 'tinybase/with-schemas'
import { z } from 'zod'

export const MessageRole = z.enum(['assistant', 'user'])
export type MessageRole = z.infer<typeof MessageRole>

export const RequestStatus = z.enum(['cancelled', 'completed', 'error', 'preparing', 'streaming'])
export type RequestStatus = z.infer<typeof RequestStatus>

export const LanguageModelRecord = z.object({
  contextLength: z.number(),
  createdAt: z.number(),
  inputModalities: z.array(z.string()),
  name: z.string(),
  outputModalities: z.array(z.string()),
  provider: z.string(),
  providerName: z.string(),
  supportedParameters: z.array(z.string()),
})
export type LanguageModelRecord = z.infer<typeof LanguageModelRecord>

const ProviderOptions = z
  .record(z.string(), z.json())
  .transform((value): JSONObject => value as JSONObject)

export const RequestConfig = z.object({
  maxMessages: z.number().int().positive().optional(),
  modelId: z.string(),
  providerOptions: ProviderOptions.optional(),
  systemPromptId: z.string().optional(),
  toolIds: z.array(z.string()).optional(),
})
export type RequestConfig = z.infer<typeof RequestConfig>

export const DEFAULT_REQUEST_CONFIG: RequestConfig = {
  modelId: 'anthropic/claude-sonnet-4.5',
  providerOptions: {
    max_tokens: 10_240,
    reasoning: {
      enabled: true,
    },
  },
}

export const StepRecord = z.object({
  cost: z.object({
    completion: z.number().nullable(),
    isByok: z.boolean(),
    prompt: z.number().nullable(),
    total: z.number().nullable(),
  }),
  createdAt: z.number(),
  finishReason: z.string(),
  generationId: z.string(),
  model: z.string(),
  provider: z.string(),
  stepNumber: z.number(),
  tokens: z.object({
    audioIn: z.number(),
    audioOut: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
    imageOut: z.number(),
    input: z.number(),
    output: z.number(),
    reasoning: z.number(),
    total: z.number(),
    videoIn: z.number(),
  }),
})
export type StepRecord = z.infer<typeof StepRecord>

export const tablesSchema = {
  languageModels: {
    contextLength: { default: 0, type: 'number' },
    createdAt: { default: 0, type: 'number' },
    inputModalities: { default: [], type: 'array' },
    name: { default: '', type: 'string' },
    outputModalities: { default: [], type: 'array' },
    provider: { default: '', type: 'string' },
    providerName: { default: '', type: 'string' },
    supportedParameters: { default: [], type: 'array' },
  },
  messages: {
    createdAt: { default: 0, type: 'number' },
    parts: { default: [], type: 'array' },
    role: { default: 'user', type: 'string' },
    sessionId: { default: '', type: 'string' },
    updatedAt: { default: 0, type: 'number' },
  },
  prompts: {
    content: { default: '', type: 'string' },
    label: { default: '', type: 'string' },
  },
  requests: {
    assistantMessageId: { default: '', type: 'string' },
    config: { default: {}, type: 'object' },
    createdAt: { default: 0, type: 'number' },
    errorMessage: { default: '', type: 'string' },
    sessionId: { default: '', type: 'string' },
    status: { default: 'preparing', type: 'string' },
    steps: { default: [], type: 'array' },
    terminalAt: { default: 0, type: 'number' },
  },
  sessions: {
    config: { default: {}, type: 'object' },
    createdAt: { default: 0, type: 'number' },
    title: { default: '', type: 'string' },
    updatedAt: { default: 0, type: 'number' },
  },
} as const satisfies TablesSchema

export const valuesSchema = {
  catalogLastRefreshed: { default: 0, type: 'number' },
  cliActiveSessionId: { default: '', type: 'string' },
} as const satisfies ValuesSchema

export type DbSchemas = [typeof tablesSchema, typeof valuesSchema]

type Schema = typeof tablesSchema
type NormalStore = Store<DbSchemas>
type MergeableDbStore = MergeableStore<DbSchemas>

// oxlint-disable-next-line typescript/no-namespace -- Namespaces keep contested schema row names grouped at call sites, e.g. Rows.Message.
export namespace Rows {
  export type LanguageModel = LanguageModelRecord & { id: string }
  export type Message = Omit<Row<Schema, 'messages'>, 'parts' | 'role'> & {
    id: string
    parts: UIMessage['parts']
    role: MessageRole
  }
  export type Prompt = Row<Schema, 'prompts'> & { id: string }
  export type Request = Omit<Row<Schema, 'requests'>, 'config' | 'status' | 'steps'> & {
    config: RequestConfig
    id: string
    status: RequestStatus
    steps: StepRecord[]
  }
  export type Session = Omit<Row<Schema, 'sessions'>, 'config'> & {
    config: RequestConfig
    id: string
  }
}

function addIndexes(store: NormalStore | MergeableDbStore) {
  return (
    createIndexes(store)
      // HLC row IDs are lexicographically sortable, giving creation-time order for free.
      .setIndexDefinition('messagesBySession', 'messages', 'sessionId')
      .setIndexDefinition('requestByAssistantMessage', 'requests', 'assistantMessageId')
      // Descending by createdAt — most recent request first.
      .setIndexDefinition(
        'requestsBySession',
        'requests',
        'sessionId',
        'createdAt',
        undefined,
        (a, b) => Number(b) - Number(a),
      )
  )
}

export function createTetraDb() {
  const store = createTinybaseStore().setSchema(tablesSchema, valuesSchema)
  return {
    indexes: addIndexes(store),
    store,
  }
}

export function createTetraMergeableDb() {
  const store = createMergeableStore().setSchema(tablesSchema, valuesSchema)
  return {
    indexes: addIndexes(store),
    store,
  }
}

export type TetraDb = ReturnType<typeof createTetraDb>
