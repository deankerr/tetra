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
export type GenerationStatus = 'cancelled' | 'completed' | 'error' | 'preparing' | 'streaming'
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
const MessageRoleSchema = z.enum(['assistant', 'user'])
const RequestStatusSchema = z.enum(['cancelled', 'completed', 'error', 'preparing', 'streaming'])
const StringArray = z.array(z.string())

export const tetraDbDefinition = defineTypedTinybase({
  indexes: {
    generationByRequest: tinybaseIndex('messageGenerations', 'requestId'),
    generationBySession: tinybaseIndex('messageGenerations', 'sessionId'),
    // HLC row IDs are lexicographically sortable, giving creation-time order for free.
    messagesBySession: tinybaseIndex('messages', 'sessionId'),
    requestsByAssistantMessage: tinybaseIndex('requests', 'assistantMessageId', {
      rowIdSorter: (a, b) => Number(b) - Number(a),
      sortBy: 'createdAt',
    }),
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

export type SessionConfigRow = OutputRowOf<
  (typeof tetraDbDefinition.tables.sessionConfigs)['schema']
>

export function requestConfigToSessionConfigRow(config: RequestConfig): SessionConfigRow {
  return {
    maxMessages: config.maxMessages ?? 0,
    modelId: config.modelId,
    providerOptions: config.providerOptions ?? {},
    systemPromptId: config.systemPromptId ?? '',
    toolIds: config.toolIds ?? [],
  }
}

export function sessionConfigRowToRequestConfig(row: SessionConfigRow): RequestConfig {
  return {
    modelId: row.modelId,
    ...(row.maxMessages !== 0 && { maxMessages: row.maxMessages }),
    ...(row.systemPromptId !== '' && { systemPromptId: row.systemPromptId }),
    ...(Object.keys(row.providerOptions).length > 0 && { providerOptions: row.providerOptions }),
    ...(row.toolIds.length > 0 && { toolIds: row.toolIds }),
  }
}

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
  export type SessionConfig = SessionConfigRow & {
    id: string
  }
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

export function combineUsageSummaries(summaries: UsageSummary[]): UsageSummary {
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let costInput = 0
  let costOutput = 0
  let costTotal = 0
  let hasCostInput = false
  let hasCostOutput = false
  let hasCostTotal = false
  let inputTokens = 0
  let outputTokens = 0
  let reasoningTokens = 0
  let totalTokens = 0

  for (const summary of summaries) {
    cacheReadTokens += summary.cacheReadTokens ?? 0
    cacheWriteTokens += summary.cacheWriteTokens ?? 0
    inputTokens += summary.inputTokens ?? 0
    outputTokens += summary.outputTokens ?? 0
    reasoningTokens += summary.reasoningTokens ?? 0
    totalTokens += summary.totalTokens ?? 0
    if (summary.costInput !== undefined) {
      costInput += summary.costInput
      hasCostInput = true
    }
    if (summary.costOutput !== undefined) {
      costOutput += summary.costOutput
      hasCostOutput = true
    }
    if (summary.costTotal !== undefined) {
      costTotal += summary.costTotal
      hasCostTotal = true
    }
  }

  return compactUsageSummary({
    cacheReadTokens,
    cacheWriteTokens,
    costInput: hasCostInput ? costInput : undefined,
    costOutput: hasCostOutput ? costOutput : undefined,
    costTotal: hasCostTotal ? costTotal : undefined,
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  })
}

export function deriveUsageSummary(steps: StepRecord[]): UsageSummary {
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let costInput = 0
  let costOutput = 0
  let costTotal = 0
  let hasCostInput = false
  let hasCostOutput = false
  let hasCostTotal = false
  let inputTokens = 0
  let outputTokens = 0
  let reasoningTokens = 0
  let totalTokens = 0

  for (const { cost, tokens } of steps) {
    cacheReadTokens += tokens.inputCacheRead ?? 0
    cacheWriteTokens += tokens.inputCacheWrite ?? 0
    inputTokens += tokens.inputTotal
    outputTokens += tokens.outputTotal
    reasoningTokens += tokens.outputReasoning ?? 0
    totalTokens += tokens.total
    if (cost.inputTotal !== undefined) {
      costInput += cost.inputTotal
      hasCostInput = true
    }
    if (cost.outputTotal !== undefined) {
      costOutput += cost.outputTotal
      hasCostOutput = true
    }
    if (cost.total !== undefined) {
      costTotal += cost.total
      hasCostTotal = true
    }
  }

  return compactUsageSummary({
    cacheReadTokens,
    cacheWriteTokens,
    costInput: hasCostInput ? costInput : undefined,
    costOutput: hasCostOutput ? costOutput : undefined,
    costTotal: hasCostTotal ? costTotal : undefined,
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  })
}

function compactUsageSummary(summary: UsageSummary): UsageSummary {
  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== undefined && value !== 0),
  ) as UsageSummary
}
