import { defineTypedStore } from '@tetra/tinybase-schema'
import type { UIMessage } from 'ai'
import { z } from 'zod'

const MessagePartSchema = z.custom<UIMessage['parts'][number]>(
  (value) => typeof value === 'object' && value !== null && 'type' in value,
)

const MessageRoleSchema = z.string()
const ProviderOptionsSchema = z.record(z.string(), z.json())
const RunConfigSnapshotSchema = z.record(z.string(), z.json())
const RunStatusSchema = z.enum(['active', 'cancelled', 'completed', 'error'])

const SessionRunConfigSchema = z.object({
  maxMessages: z.number().int().nonnegative().default(0),
  modelId: z.string().default(''),
  providerOptions: ProviderOptionsSchema.default({}),
  systemPromptId: z.string().default(''),
  toolIds: z.array(z.string()).default([]),
})

const StepUsageSchema = z.object({
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

const StepCostSchema = z.object({
  currency: z.literal('USD').optional(),
  input: z.number().optional(),
  output: z.number().optional(),
  total: z.number().optional(),
})

const StepRawSchema = z.object({
  finishReason: z.string().optional(),
  usage: z.record(z.string(), z.json()).optional(),
})

const StepWarningSchema = z.looseObject({
  details: z.string().optional(),
  feature: z.string().optional(),
  message: z.string().optional(),
  type: z.string(),
})

const StepRecordSchema = z.object({
  cost: StepCostSchema,
  createdAt: z.number(),
  finishReason: z.string(),
  generationId: z.string(),
  messageId: z.string(),
  model: z.string(),
  provider: z.string(),
  raw: StepRawSchema,
  runId: z.string(),
  sessionId: z.string(),
  stepNumber: z.number(),
  usage: StepUsageSchema,
  warnings: z.array(StepWarningSchema),
})

export const libraryStoreSchema = defineTypedStore({
  tables: {
    messages: z.object({
      createdAt: z.number(),
      parentMessageId: z.string().nullable(),
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
      config: RunConfigSnapshotSchema,
      createdAt: z.number(),
      errorMessage: z.string(),
      sessionId: z.string(),
      status: RunStatusSchema,
      targetMessageId: z.string(),
      terminalAt: z.number(),
      updatedAt: z.number(),
    }),
    sessionRunConfigs: SessionRunConfigSchema,
    sessions: z.object({
      createdAt: z.number(),
      title: z.string(),
      updatedAt: z.number(),
    }),
    steps: StepRecordSchema,
  },
  values: {
    defaultRunConfig: RunConfigSnapshotSchema.nullable().default(null),
  },
})
