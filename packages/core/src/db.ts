import type { JSONObject } from '@ai-sdk/provider'
import {
  defineTypedTinybase,
  tinybaseCell,
  tinybaseIndex,
  tinybaseTable,
} from '@tetra/tinybase-schema'
import type { EntityOf } from '@tetra/tinybase-schema'
import type { UIMessage } from 'ai'
import { getHlcFunctions } from 'tinybase/common'
import { z } from 'zod'

const ProviderOptions = z.custom<JSONObject>(
  (value) => z.record(z.string(), z.json()).safeParse(value).success,
)

export const RequestConfig = z.object({
  maxMessages: z.number().int().nonnegative(),
  modelId: z.string(),
  providerOptions: ProviderOptions,
  systemPromptId: z.string(),
  toolIds: z.array(z.string()),
})
export type RequestConfig = z.infer<typeof RequestConfig>

export const DEFAULT_REQUEST_CONFIG: RequestConfig = {
  maxMessages: 0,
  modelId: '',
  providerOptions: {},
  systemPromptId: '',
  toolIds: [],
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

export const UsageSummary = z.object({
  cacheReadTokens: z.number().optional(),
  cacheWriteTokens: z.number().optional(),
  costInput: z.number().optional(),
  costOutput: z.number().optional(),
  costTotal: z.number().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  reasoningTokens: z.number().optional(),
  totalTokens: z.number().optional(),
})
export type UsageSummary = z.infer<typeof UsageSummary>

const EMPTY_USAGE: UsageSummary = {}
const MessageParts = z.custom<UIMessage['parts']>((value) => Array.isArray(value))
const GenerationStatusSchema = z.enum(['cancelled', 'completed', 'error', 'preparing', 'streaming'])
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>
const MessageRoleSchema = z.enum(['assistant', 'user'])
export type MessageRole = z.infer<typeof MessageRoleSchema>
const RequestStatusSchema = z.enum(['cancelled', 'completed', 'error', 'preparing', 'streaming'])
export type RequestStatus = z.infer<typeof RequestStatusSchema>

export const tetraDbDefinition = defineTypedTinybase({
  indexes: {
    generationByRequest: tinybaseIndex('messageGenerations', 'requestId'),
    generationBySession: tinybaseIndex('messageGenerations', 'sessionId'),
    // HLC row IDs are lexicographically sortable, giving creation-time order for free.
    messagesBySession: tinybaseIndex('messages', 'sessionId'),
    requestsByAssistantMessageNewestFirst: tinybaseIndex('requests', 'assistantMessageId', {
      rowIdSorter: (a, b) => Number(b) - Number(a),
      sortBy: 'createdAt',
    }),
    requestsBySessionNewestFirst: tinybaseIndex('requests', 'sessionId', {
      rowIdSorter: (a, b) => Number(b) - Number(a),
      sortBy: 'createdAt',
    }),
  },
  tables: {
    languageModels: tinybaseTable({
      contextLength: tinybaseCell.number(z.number(), { default: 0 }),
      createdAt: tinybaseCell.number(z.number(), { default: 0 }),
      inputModalities: tinybaseCell.array(z.array(z.string()), { default: [] }),
      name: tinybaseCell.string(z.string(), { default: '' }),
      outputModalities: tinybaseCell.array(z.array(z.string()), { default: [] }),
      provider: tinybaseCell.string(z.string(), { default: '' }),
      providerName: tinybaseCell.string(z.string(), { default: '' }),
      supportedParameters: tinybaseCell.array(z.array(z.string()), { default: [] }),
      updatedAt: tinybaseCell.number(z.number(), { default: 0 }),
      upstreamCreatedAt: tinybaseCell.number(z.number(), { default: 0 }),
    }),
    messageGenerations: tinybaseTable({
      createdAt: tinybaseCell.number(z.number(), { default: 0 }),
      parts: tinybaseCell.array(MessageParts, { default: [] }),
      requestId: tinybaseCell.string(z.string(), { default: '' }),
      sessionId: tinybaseCell.string(z.string(), { default: '' }),
      status: tinybaseCell.string(GenerationStatusSchema, {
        default: 'preparing',
      }),
      steps: tinybaseCell.array(z.array(StepRecord), { default: [] }),
      updatedAt: tinybaseCell.number(z.number(), { default: 0 }),
      usage: tinybaseCell.object(UsageSummary, { default: EMPTY_USAGE }),
    }),
    messages: tinybaseTable({
      createdAt: tinybaseCell.number(z.number(), { default: 0 }),
      parts: tinybaseCell.array(MessageParts, { default: [] }),
      role: tinybaseCell.string(MessageRoleSchema, { default: 'user' }),
      sessionId: tinybaseCell.string(z.string(), { default: '' }),
      steps: tinybaseCell.array(z.array(StepRecord), { default: [] }),
      updatedAt: tinybaseCell.number(z.number(), { default: 0 }),
      usage: tinybaseCell.object(UsageSummary, { default: EMPTY_USAGE }),
    }),
    prompts: tinybaseTable({
      content: tinybaseCell.string(z.string(), { default: '' }),
      createdAt: tinybaseCell.number(z.number(), { default: 0 }),
      label: tinybaseCell.string(z.string(), { default: '' }),
      updatedAt: tinybaseCell.number(z.number(), { default: 0 }),
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
      updatedAt: tinybaseCell.number(z.number(), { default: 0 }),
    }),
    // Execution parameters for a session. Keyed by the same ID as the sessions table (1:1).
    // Stored separately so sidebar reactive reads on sessions are not triggered by config edits.
    sessionConfigs: tinybaseTable({
      maxMessages: tinybaseCell.number(z.number(), { default: 0 }),
      modelId: tinybaseCell.string(z.string(), { default: '' }),
      providerOptions: tinybaseCell.object(ProviderOptions, { default: {} }),
      systemPromptId: tinybaseCell.string(z.string(), { default: '' }),
      toolIds: tinybaseCell.array(z.array(z.string()), { default: [] }),
    }),
    // Derived usage for a session. Keyed by the same ID as the sessions table (1:1).
    // Stored separately so sidebar/session identity reads are not invalidated by usage churn.
    sessionSummaries: tinybaseTable({
      createdAt: tinybaseCell.number(z.number(), { default: 0 }),
      updatedAt: tinybaseCell.number(z.number(), { default: 0 }),
      usage: tinybaseCell.object(UsageSummary, { default: EMPTY_USAGE }),
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
  export type MessageGeneration = EntityOf<
    (typeof tetraDbDefinition.tables.messageGenerations)['schema']
  >
  export type Message = EntityOf<(typeof tetraDbDefinition.tables.messages)['schema']>
  export type Prompt = EntityOf<(typeof tetraDbDefinition.tables.prompts)['schema']>
  export type Request = EntityOf<(typeof tetraDbDefinition.tables.requests)['schema']>
  export type Session = EntityOf<(typeof tetraDbDefinition.tables.sessions)['schema']>
  export type SessionSummary = EntityOf<
    (typeof tetraDbDefinition.tables.sessionSummaries)['schema']
  >
  export type SessionConfig = EntityOf<(typeof tetraDbDefinition.tables.sessionConfigs)['schema']>
}

export function createTetraStore({ mergeable = true }: { mergeable?: boolean } = {}) {
  return mergeable
    ? tetraDbDefinition.createTinybaseMergeableStore()
    : tetraDbDefinition.createTinybaseStore()
}

export type TetraStore = ReturnType<typeof createTetraStore>

export function createTetraIndexes(store: TetraStore) {
  return tetraDbDefinition.createTinybaseIndexes(store)
}

export type TetraIndexes = ReturnType<typeof createTetraIndexes>

export function bindTetraDb(store: TetraStore, rawIndexes: TetraIndexes) {
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

export function createTetraDb({ mergeable = true }: { mergeable?: boolean } = {}) {
  const store = createTetraStore({ mergeable })
  const rawIndexes = createTetraIndexes(store)
  return bindTetraDb(store, rawIndexes)
}

export type TetraDb = ReturnType<typeof createTetraDb>

const [getNextHlc] = getHlcFunctions()
export function createIdGenerator(prefix: string): () => string {
  return () => `${prefix}_${getNextHlc()}`
}
