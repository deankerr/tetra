import type {
  BoundIndexes,
  StoreApiFor,
  StoreRowsFor,
  StoreSchemasFor,
} from '@tetra/tinybase-schema'
import { defineTypedStore } from '@tetra/tinybase-schema'
import type { UIMessage } from 'ai'
import type { Indexes as RawIndexes } from 'tinybase/indexes/with-schemas'
import type { Store as RawStore } from 'tinybase/store/with-schemas'
import { z } from 'zod'

const ProviderOptions = z.record(z.string(), z.json())
export type ProviderOptions = z.infer<typeof ProviderOptions>

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

const TokenMetrics = z.object({
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
type TokenMetrics = z.infer<typeof TokenMetrics>

const CostMetrics = z.object({
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
type CostMetrics = z.infer<typeof CostMetrics>

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

const MessagePart = z.custom<UIMessage['parts'][number]>(
  (value) => typeof value === 'object' && value !== null && 'type' in value,
)
const GenerationStatusSchema = z.enum(['cancelled', 'completed', 'error', 'preparing', 'streaming'])
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>
const MessageRoleSchema = z.enum(['assistant', 'user'])
export type MessageRole = z.infer<typeof MessageRoleSchema>
const RequestStatusSchema = z.enum(['cancelled', 'completed', 'error', 'preparing', 'streaming'])
export type RequestStatus = z.infer<typeof RequestStatusSchema>

export const tetraIndexIds = [
  'generationByRequest',
  'generationBySession',
  'messagesBySession',
  'requestsByAssistantMessageNewestFirst',
  'requestsBySessionNewestFirst',
] as const

export const tetraStoreSchema = defineTypedStore({
  tables: {
    languageModels: z.object({
      contextLength: z.number(),
      createdAt: z.number(),
      inputModalities: z.array(z.string()),
      name: z.string(),
      outputModalities: z.array(z.string()),
      provider: z.string(),
      providerName: z.string(),
      supportedParameters: z.array(z.string()),
      updatedAt: z.number(),
      upstreamCreatedAt: z.number(),
    }),
    messageGenerations: z.object({
      createdAt: z.number(),
      parts: z.array(MessagePart),
      requestId: z.string(),
      sessionId: z.string(),
      status: GenerationStatusSchema,
      steps: z.array(StepRecord),
      updatedAt: z.number(),
      usage: UsageSummary,
    }),
    messages: z.object({
      createdAt: z.number(),
      parts: MessagePart.array(),
      role: MessageRoleSchema,
      sessionId: z.string(),
      steps: z.array(StepRecord),
      updatedAt: z.number(),
      usage: UsageSummary,
    }),
    prompts: z.object({
      content: z.string(),
      createdAt: z.number(),
      label: z.string(),
      updatedAt: z.number(),
    }),
    requests: z.object({
      assistantMessageId: z.string(),
      config: RequestConfig,
      createdAt: z.number(),
      errorMessage: z.string(),
      sessionId: z.string(),
      status: RequestStatusSchema,
      terminalAt: z.number(),
      updatedAt: z.number(),
    }),
    // Execution parameters for a session. Keyed by the same ID as the sessions table (1:1).
    // Stored separately so sidebar reactive reads on sessions are not triggered by config edits.
    sessionConfigs: z.object({
      maxMessages: z.number(),
      modelId: z.string(),
      providerOptions: ProviderOptions,
      systemPromptId: z.string(),
      toolIds: z.array(z.string()),
    }),
    // Derived usage for a session. Keyed by the same ID as the sessions table (1:1).
    // Stored separately so sidebar/session identity reads are not invalidated by usage churn.
    sessionSummaries: z.object({
      createdAt: z.number(),
      updatedAt: z.number(),
      usage: UsageSummary,
    }),
    sessions: z.object({
      createdAt: z.number(),
      title: z.string(),
      updatedAt: z.number(),
    }),
  },
  values: {
    catalogLastRefreshed: z.number(),
    cliActiveSessionId: z.string(),
    // Mutable workspace-level default applied when creating a new session. Stored as a blob
    // since it is a cold path (read once at session creation, not on every render).
    defaultSessionConfig: RequestConfig,
  },
})

export type TetraRawIndexes = RawIndexes<StoreSchemasFor<typeof tetraStoreSchema>>
export type TetraRawStore = RawStore<StoreSchemasFor<typeof tetraStoreSchema>>
export type TetraTypedIndexes = BoundIndexes<typeof tetraIndexIds>
export type TetraTypedStore = StoreApiFor<typeof tetraStoreSchema>

export type Rows = StoreRowsFor<typeof tetraStoreSchema>

export function setTetraIndexDefinitions(indexes: TetraRawIndexes): void {
  // Apply native TinyBase indexes from the store model definition.
  indexes
    .setIndexDefinition('generationByRequest', 'messageGenerations', 'requestId')
    .setIndexDefinition('generationBySession', 'messageGenerations', 'sessionId')
    // HLC row IDs are lexicographically sortable, giving creation-time order for free.
    .setIndexDefinition('messagesBySession', 'messages', 'sessionId')
    .setIndexDefinition(
      'requestsByAssistantMessageNewestFirst',
      'requests',
      'assistantMessageId',
      'createdAt',
      undefined,
      (a, b) => Number(b) - Number(a),
    )
    .setIndexDefinition(
      'requestsBySessionNewestFirst',
      'requests',
      'sessionId',
      'createdAt',
      undefined,
      (a, b) => Number(b) - Number(a),
    )
}
