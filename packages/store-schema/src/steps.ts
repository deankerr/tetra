import { z } from 'zod'

// Usage buckets mirror the rendered accounting groups without forcing providers to report all cells.
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

// Costs are sparse because provider pricing data may be unavailable for a step.
const StepCostSchema = z.object({
  currency: z.literal('USD').optional(),
  input: z.number().optional(),
  output: z.number().optional(),
  total: z.number().optional(),
})

// Raw step data preserves provider-specific details next to normalized accounting.
const StepRawSchema = z.object({
  finishReason: z.string().optional(),
  usage: z.record(z.string(), z.json()).optional(),
})

// Warnings stay loose so future AI SDK fields remain visible instead of being dropped.
export const StepWarningSchema = z.looseObject({
  details: z.string().optional(),
  feature: z.string().optional(),
  message: z.string().optional(),
  type: z.string(),
})

// Step records are the persisted accounting artifact attached to messages, runs, and sessions.
export const StepRecordSchema = z.object({
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
