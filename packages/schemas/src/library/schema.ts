import { defineSchema } from '@tetra/tinydb'
import type { UIMessage } from 'ai'
import { z } from 'zod'

const MessagePartSchema = z.custom<UIMessage['parts'][number]>(
  (value) => typeof value === 'object' && value !== null && 'type' in value,
)

const MessageRoleSchema = z.string()
export const ProviderOptionsSchema = z.record(z.string(), z.json())
export const RunConfigSchema = z.object({
  maxMessages: z.number().int().nonnegative(),
  modelId: z.string(),
  providerOptions: ProviderOptionsSchema,
  systemPromptId: z.string(),
  toolIds: z.array(z.string()),
})
export const RunConfigSnapshotSchema = z.record(z.string(), z.json())
const RunStatusSchema = z.enum(['active', 'cancelled', 'completed', 'error'])

export const SessionRunConfigSchema = z.object({
  maxMessages: z.number().int().nonnegative().default(0),
  modelId: z.string().default(''),
  providerOptions: ProviderOptionsSchema.default({}),
  systemPromptId: z.string().default(''),
  toolIds: z.array(z.string()).default([]),
})
const DefaultSessionRunConfig = SessionRunConfigSchema.parse({})

export type RunConfig = z.infer<typeof RunConfigSchema>

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

export const StepWarningSchema = z.looseObject({
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

export const librarySchema = defineSchema({
  indexes: {
    messages: { bySession: { on: 'sessionId', sort: 'createdAt' } },
    runs: {
      bySessionNewestFirst: { desc: true, on: 'sessionId', sort: 'createdAt' },
      byTargetMessageNewestFirst: { desc: true, on: 'targetMessageId', sort: 'createdAt' },
    },
    steps: {
      byMessage: { on: 'messageId', sort: 'createdAt' },
      byRun: { on: 'runId', sort: 'stepNumber' },
      bySession: { on: 'sessionId', sort: 'createdAt' },
    },
  },
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
    sessions: z.object({
      config: SessionRunConfigSchema.default(DefaultSessionRunConfig),
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
