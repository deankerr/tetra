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

import { ProviderOptionsSchema, RunConfigSnapshotSchema } from './run-config.ts'
import { StepRecordSchema } from './steps.ts'

// UI message parts are owned by the AI SDK, so Tetra only verifies their object-like shape.
const MessagePartSchema = z.custom<UIMessage['parts'][number]>(
  (value) => typeof value === 'object' && value !== null && 'type' in value,
)

// Enum schemas stay near the table cells that use them.
const MessageRoleSchema = z.enum(['assistant', 'user'])
const RunStatusSchema = z.enum(['cancelled', 'completed', 'error', 'preparing', 'streaming'])

// Index ids are shared with typed TinyBase bindings at app and test boundaries.
export const tetraIndexIds = [
  'messagesBySession',
  'runsByAssistantMessageNewestFirst',
  'runsBySessionNewestFirst',
  'streamingPartsBySession',
  'stepsByMessage',
  'stepsByRun',
  'stepsBySession',
] as const

// The Tetra store schema owns durable TinyBase tables, values, and coarse cell schemas.
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
      parts: MessagePartSchema.array(),
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
      config: RunConfigSnapshotSchema,
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
      providerOptions: ProviderOptionsSchema,
      systemPromptId: z.string(),
      toolIds: z.array(z.string()),
    }),
    sessions: z.object({
      createdAt: z.number(),
      title: z.string(),
      updatedAt: z.number(),
    }),
    steps: StepRecordSchema,
    streamingMessageParts: z.object({
      createdAt: z.number(),
      parts: z.array(MessagePartSchema),
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
    defaultRunConfig: RunConfigSnapshotSchema,
  },
})

// These aliases are kept while app boundaries still pass raw and typed TinyBase objects explicitly.
export type TetraRawIndexes = RawIndexes<StoreSchemasFor<typeof tetraStoreSchema>>
export type TetraRawStore = RawStore<StoreSchemasFor<typeof tetraStoreSchema>>
export type TetraTypedIndexes = BoundIndexes<typeof tetraIndexIds>
export type TetraTypedStore = StoreApiFor<typeof tetraStoreSchema>

// Persisted table row types are addressed through the schema-derived Rows map.
export type Rows = StoreRowsFor<typeof tetraStoreSchema>
