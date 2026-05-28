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

export const RunConfig = z.object({
  maxMessages: z.number().int().nonnegative(),
  modelId: z.string(),
  providerOptions: ProviderOptions,
  systemPromptId: z.string(),
  toolIds: z.array(z.string()),
})
export type RunConfig = z.infer<typeof RunConfig>

export const RunConfigSnapshot = z.record(z.string(), z.json())
export type RunConfigSnapshot = z.infer<typeof RunConfigSnapshot>

export const DEFAULT_RUN_CONFIG: RunConfig = {
  maxMessages: 0,
  modelId: '',
  providerOptions: {},
  systemPromptId: '',
  toolIds: [],
}

export const StepUsage = z.object({
  input: z.object({
    cacheRead: z.number().optional(),
    cacheWrite: z.number().optional(),
    noCache: z.number().optional(),
    total: z.number().optional(),
  }),
  output: z.object({
    reasoning: z.number().optional(),
    text: z.number().optional(),
    total: z.number().optional(),
  }),
  total: z.number().optional(),
})
export type StepUsage = z.infer<typeof StepUsage>

export const StepCost = z.object({
  currency: z.literal('USD').optional(),
  input: z.number().optional(),
  output: z.number().optional(),
  total: z.number().optional(),
})
export type StepCost = z.infer<typeof StepCost>

export const StepRaw = z.object({
  finishReason: z.string().optional(),
  usage: z.record(z.string(), z.json()).optional(),
})
export type StepRaw = z.infer<typeof StepRaw>

export const StepWarning = z.looseObject({
  details: z.string().optional(),
  feature: z.string().optional(),
  message: z.string().optional(),
  type: z.string(),
})
export type StepWarning = z.infer<typeof StepWarning>

export const StepRecord = z.object({
  cost: StepCost,
  createdAt: z.number(),
  finishReason: z.string(),
  generationId: z.string(),
  messageId: z.string(),
  model: z.string(),
  provider: z.string(),
  raw: StepRaw,
  runId: z.string(),
  sessionId: z.string(),
  stepNumber: z.number(),
  usage: StepUsage,
  warnings: z.array(StepWarning),
})
export type StepRecord = z.infer<typeof StepRecord>

const MessagePart = z.custom<UIMessage['parts'][number]>(
  (value) => typeof value === 'object' && value !== null && 'type' in value,
)
const MessageRoleSchema = z.enum(['assistant', 'user'])
export type MessageRole = z.infer<typeof MessageRoleSchema>
const RunStatusSchema = z.enum(['cancelled', 'completed', 'error', 'preparing', 'streaming'])
export type RunStatus = z.infer<typeof RunStatusSchema>

export const tetraIndexIds = [
  'messagesBySession',
  'runsByAssistantMessageNewestFirst',
  'runsBySessionNewestFirst',
  'streamingPartsBySession',
  'stepsByMessage',
  'stepsByRun',
  'stepsBySession',
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
    messages: z.object({
      createdAt: z.number(),
      parts: MessagePart.array(),
      role: MessageRoleSchema,
      sessionId: z.string(),
      updatedAt: z.number(),
    }),
    modelFavorites: z.object({
      createdAt: z.number(),
    }),
    prompts: z.object({
      content: z.string(),
      createdAt: z.number(),
      label: z.string(),
      updatedAt: z.number(),
    }),
    runs: z.object({
      assistantMessageId: z.string(),
      config: RunConfigSnapshot,
      createdAt: z.number(),
      errorMessage: z.string(),
      sessionId: z.string(),
      status: RunStatusSchema,
      terminalAt: z.number(),
      updatedAt: z.number(),
    }),
    // Execution parameters for a session. Keyed by the same ID as the sessions table (1:1).
    // Stored separately so sidebar reactive reads on sessions are not triggered by config edits.
    sessionRunConfigs: z.object({
      maxMessages: z.number(),
      modelId: z.string(),
      providerOptions: ProviderOptions,
      systemPromptId: z.string(),
      toolIds: z.array(z.string()),
    }),
    sessions: z.object({
      createdAt: z.number(),
      title: z.string(),
      updatedAt: z.number(),
    }),
    steps: StepRecord,
    streamingMessageParts: z.object({
      createdAt: z.number(),
      parts: z.array(MessagePart),
      runId: z.string(),
      sessionId: z.string(),
      updatedAt: z.number(),
    }),
  },
  values: {
    catalogLastRefreshed: z.number(),
    cliActiveSessionId: z.string(),
    // Mutable workspace-level default applied when creating a new session. Stored as a blob
    // since it is a cold path (read once at session creation, not on every render).
    defaultRunConfig: RunConfigSnapshot,
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
    // HLC row IDs are lexicographically sortable, giving creation-time order for free.
    .setIndexDefinition('messagesBySession', 'messages', 'sessionId')
    .setIndexDefinition(
      'runsByAssistantMessageNewestFirst',
      'runs',
      'assistantMessageId',
      'createdAt',
      undefined,
      (a, b) => Number(b) - Number(a),
    )
    .setIndexDefinition(
      'runsBySessionNewestFirst',
      'runs',
      'sessionId',
      'createdAt',
      undefined,
      (a, b) => Number(b) - Number(a),
    )
    .setIndexDefinition('streamingPartsBySession', 'streamingMessageParts', 'sessionId')
    .setIndexDefinition('stepsByMessage', 'steps', 'messageId', 'createdAt')
    .setIndexDefinition('stepsByRun', 'steps', 'runId', 'stepNumber')
    .setIndexDefinition('stepsBySession', 'steps', 'sessionId', 'createdAt')
}
