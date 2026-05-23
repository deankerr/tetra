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

export const TokenMetrics = z.object({
  inputAudio: z.number().optional(),
  inputCacheRead: z.number().optional(),
  inputCacheWrite: z.number().optional(),
  inputImage: z.number().optional(),
  inputNoCache: z.number().optional(),
  inputText: z.number().optional(),
  inputTotal: z.number(),
  inputVideo: z.number().optional(),
  outputAudio: z.number().optional(),
  outputImage: z.number().optional(),
  outputReasoning: z.number().optional(),
  outputText: z.number().optional(),
  outputTotal: z.number(),
  outputVideo: z.number().optional(),
  total: z.number(),
})
export type TokenMetrics = z.infer<typeof TokenMetrics>

export const CostMetrics = z.object({
  currency: z.literal('USD'),
  inputAudio: z.number().optional(),
  inputCacheRead: z.number().optional(),
  inputCacheWrite: z.number().optional(),
  inputImage: z.number().optional(),
  inputNoCache: z.number().optional(),
  inputText: z.number().optional(),
  inputTotal: z.number().optional(),
  inputVideo: z.number().optional(),
  isByok: z.boolean(),
  outputAudio: z.number().optional(),
  outputImage: z.number().optional(),
  outputReasoning: z.number().optional(),
  outputText: z.number().optional(),
  outputTotal: z.number().optional(),
  outputVideo: z.number().optional(),
  total: z.number().optional(),
})
export type CostMetrics = z.infer<typeof CostMetrics>

export const StepRecord = z.object({
  cost: CostMetrics,
  createdAt: z.number(),
  finishReason: z.string(),
  generationId: z.string(),
  model: z.string(),
  provider: z.string(),
  stepNumber: z.number(),
  tokens: TokenMetrics,
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
      contextLength: tinybaseCell.number(z.number(), { default: 0 }),
      createdAt: tinybaseCell.number(z.number(), { default: 0 }),
      inputModalities: tinybaseCell.array(StringArray, { default: [] }),
      name: tinybaseCell.string(z.string(), { default: '' }),
      outputModalities: tinybaseCell.array(StringArray, { default: [] }),
      provider: tinybaseCell.string(z.string(), { default: '' }),
      providerName: tinybaseCell.string(z.string(), { default: '' }),
      supportedParameters: tinybaseCell.array(StringArray, { default: [] }),
    }),
    messages: tinybaseTable({
      createdAt: tinybaseCell.number(z.number(), { default: 0 }),
      parts: tinybaseCell.array(MessageParts, { default: [] }),
      role: tinybaseCell.string(MessageRoleSchema, { default: 'user' }),
      sessionId: tinybaseCell.string(z.string(), { default: '' }),
      steps: tinybaseCell.array(z.array(StepRecord), { default: [] }),
      updatedAt: tinybaseCell.number(z.number(), { default: 0 }),
    }),
    prompts: tinybaseTable({
      content: tinybaseCell.string(z.string(), { default: '' }),
      label: tinybaseCell.string(z.string(), { default: '' }),
    }),
    requests: tinybaseTable({
      assistantMessageId: tinybaseCell.string(z.string(), { default: '' }),
      config: tinybaseCell.object(RequestConfig, {
        default: DEFAULT_REQUEST_CONFIG,
      }),
      createdAt: tinybaseCell.number(z.number(), { default: 0 }),
      errorMessage: tinybaseCell.string(z.string(), { default: '' }),
      sessionId: tinybaseCell.string(z.string(), { default: '' }),
      status: tinybaseCell.string(RequestStatusSchema, {
        default: 'preparing',
      }),
      terminalAt: tinybaseCell.number(z.number(), { default: 0 }),
    }),
    // Execution parameters for a session. Keyed by the same ID as the sessions table (1:1).
    // Stored separately so sidebar reactive reads on sessions are not triggered by config edits.
    sessionConfigs: tinybaseTable({
      maxMessages: tinybaseCell.number(z.number(), { default: 0 }),
      modelId: tinybaseCell.string(z.string(), {
        default: DEFAULT_REQUEST_CONFIG.modelId,
      }),
      providerOptions: tinybaseCell.object(ProviderOptions, { default: {} }),
      systemPromptId: tinybaseCell.string(z.string(), { default: '' }),
      toolIds: tinybaseCell.array(StringArray, { default: [] }),
    }),
    sessions: tinybaseTable({
      createdAt: tinybaseCell.number(z.number(), { default: 0 }),
      title: tinybaseCell.string(z.string(), { default: '' }),
      updatedAt: tinybaseCell.number(z.number(), { default: 0 }),
    }),
  },
  values: {
    catalogLastRefreshed: tinybaseCell.number(z.number(), { default: 0 }),
    cliActiveSessionId: tinybaseCell.string(z.string(), { default: '' }),
    // Mutable workspace-level default applied when creating a new session. Stored as a blob
    // since it is a cold path (read once at session creation, not on every render).
    defaultSessionConfig: tinybaseCell.object(RequestConfig, {
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

export function createTetraDb({ mergeable = true }: { mergeable?: boolean } = {}) {
  const store = mergeable
    ? tetraDbDefinition.createTinybaseMergeableStore()
    : tetraDbDefinition.createTinybaseStore()
  const rawIndexes = tetraDbDefinition.createTinybaseIndexes(store)
  const bound = tetraDbDefinition.bindTinybaseStore(store)

  return {
    indexes: tetraDbDefinition.bindTinybaseIndexes(rawIndexes),
    store,
    tables: bound.tables,
    transaction(fn: () => void) {
      bound.transaction(fn)
    },
    values: bound.values,
  }
}

export type TetraDb = ReturnType<typeof createTetraDb>

const [getNextHlc] = getHlcFunctions()
export function createIdGenerator(prefix: string): () => string {
  return () => `${prefix}_${getNextHlc()}`
}
