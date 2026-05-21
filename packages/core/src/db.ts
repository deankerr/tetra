import type { JSONObject } from '@ai-sdk/provider'
import {
  defineTypedTinybase,
  tinybaseCell,
  tinybaseIndex,
  tinybaseTable,
} from '@tetra/tinybase-schema'
import type { EntityOf, OutputRowOf } from '@tetra/tinybase-schema'
import type { UIMessage } from 'ai'
import { getHlcFunctions } from 'tinybase/common'
import { z } from 'zod'

export type MessageRole = 'assistant' | 'user'
export type RequestStatus = 'cancelled' | 'completed' | 'error' | 'preparing' | 'streaming'

const ProviderOptions = z.custom<JSONObject>(
  (value) => z.record(z.string(), z.json()).safeParse(value).success,
)

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

const MessageParts = z.custom<UIMessage['parts']>((value) => Array.isArray(value))
const MessageRoleSchema = z.enum(['assistant', 'user'])
const RequestStatusSchema = z.enum(['cancelled', 'completed', 'error', 'preparing', 'streaming'])
const StringArray = z.array(z.string())

export const tetraDbDefinition = defineTypedTinybase({
  indexes: {
    // HLC row IDs are lexicographically sortable, giving creation-time order for free.
    messagesBySession: tinybaseIndex('messages', 'sessionId'),
    requestByAssistantMessage: tinybaseIndex('requests', 'assistantMessageId'),
    requestsBySession: tinybaseIndex('requests', 'sessionId', {
      rowIdSorter: (a, b) => Number(b) - Number(a),
      sortBy: 'createdAt',
    }),
  },
  tables: {
    languageModels: tinybaseTable({
      contextLength: tinybaseCell.number(z.number().default(0), { default: 0 }),
      createdAt: tinybaseCell.number(z.number().default(0), { default: 0 }),
      inputModalities: tinybaseCell.array(StringArray.default([]), { default: [] }),
      name: tinybaseCell.string(z.string().default(''), { default: '' }),
      outputModalities: tinybaseCell.array(StringArray.default([]), { default: [] }),
      provider: tinybaseCell.string(z.string().default(''), { default: '' }),
      providerName: tinybaseCell.string(z.string().default(''), { default: '' }),
      supportedParameters: tinybaseCell.array(StringArray.default([]), { default: [] }),
    }),
    messages: tinybaseTable({
      createdAt: tinybaseCell.number(z.number().default(0), { default: 0 }),
      parts: tinybaseCell.array(MessageParts.default([]), { default: [] }),
      role: tinybaseCell.string(MessageRoleSchema.default('user'), { default: 'user' }),
      sessionId: tinybaseCell.string(z.string().default(''), { default: '' }),
      updatedAt: tinybaseCell.number(z.number().default(0), { default: 0 }),
    }),
    prompts: tinybaseTable({
      content: tinybaseCell.string(z.string().default(''), { default: '' }),
      label: tinybaseCell.string(z.string().default(''), { default: '' }),
    }),
    requests: tinybaseTable({
      assistantMessageId: tinybaseCell.string(z.string().default(''), { default: '' }),
      config: tinybaseCell.object(RequestConfig.default(DEFAULT_REQUEST_CONFIG), {
        default: DEFAULT_REQUEST_CONFIG,
      }),
      createdAt: tinybaseCell.number(z.number().default(0), { default: 0 }),
      errorMessage: tinybaseCell.string(z.string().default(''), { default: '' }),
      sessionId: tinybaseCell.string(z.string().default(''), { default: '' }),
      status: tinybaseCell.string(RequestStatusSchema.default('preparing'), {
        default: 'preparing',
      }),
      steps: tinybaseCell.array(z.array(StepRecord).default([]), { default: [] }),
      terminalAt: tinybaseCell.number(z.number().default(0), { default: 0 }),
    }),
    // Execution parameters for a session. Keyed by the same ID as the sessions table (1:1).
    // Stored separately so sidebar reactive reads on sessions are not triggered by config edits.
    sessionConfigs: tinybaseTable({
      maxMessages: tinybaseCell.number(z.number().default(0), { default: 0 }),
      modelId: tinybaseCell.string(z.string().default(DEFAULT_REQUEST_CONFIG.modelId), {
        default: DEFAULT_REQUEST_CONFIG.modelId,
      }),
      providerOptions: tinybaseCell.object(ProviderOptions.default({}), { default: {} }),
      systemPromptId: tinybaseCell.string(z.string().default(''), { default: '' }),
      toolIds: tinybaseCell.array(StringArray.default([]), { default: [] }),
    }),
    sessions: tinybaseTable({
      createdAt: tinybaseCell.number(z.number().default(0), { default: 0 }),
      title: tinybaseCell.string(z.string().default(''), { default: '' }),
      updatedAt: tinybaseCell.number(z.number().default(0), { default: 0 }),
    }),
  },
  values: {
    catalogLastRefreshed: tinybaseCell.number(z.number().default(0), { default: 0 }),
    cliActiveSessionId: tinybaseCell.string(z.string().default(''), { default: '' }),
    // Mutable workspace-level default applied when creating a new session. Stored as a blob
    // since it is a cold path (read once at session creation, not on every render).
    defaultSessionConfig: tinybaseCell.object(RequestConfig.default(DEFAULT_REQUEST_CONFIG), {
      default: DEFAULT_REQUEST_CONFIG,
    }),
  },
})

export const tablesSchema = tetraDbDefinition.tinybaseTablesSchema
export const valuesSchema = tetraDbDefinition.tinybaseValuesSchema

export type DbSchemas = [typeof tablesSchema, typeof valuesSchema]

// oxlint-disable-next-line typescript/no-namespace -- Namespaces keep contested schema row names grouped at call sites, e.g. Rows.Message.
export namespace Rows {
  export type LanguageModel = EntityOf<(typeof tetraDbDefinition.tables.languageModels)['schema']>
  export type Message = EntityOf<(typeof tetraDbDefinition.tables.messages)['schema']>
  export type Prompt = EntityOf<(typeof tetraDbDefinition.tables.prompts)['schema']>
  export type Request = EntityOf<(typeof tetraDbDefinition.tables.requests)['schema']>
  export type Session = EntityOf<(typeof tetraDbDefinition.tables.sessions)['schema']>
  export type SessionConfig = OutputRowOf<
    (typeof tetraDbDefinition.tables.sessionConfigs)['schema']
  > & {
    id: string
  }
}

export function createTetraDb() {
  const store = tetraDbDefinition.createTinybaseStore()
  const rawIndexes = tetraDbDefinition.createTinybaseIndexes(store)
  return {
    indexes: tetraDbDefinition.bindTinybaseIndexes(rawIndexes),
    store,
    tables: tetraDbDefinition.bindTinybaseStore(store),
  }
}

export type TetraDb = ReturnType<typeof createTetraDb>

const [getNextHlc] = getHlcFunctions()
export function createIdGenerator(prefix: string): () => string {
  return () => `${prefix}_${getNextHlc()}`
}
