import { z } from 'zod'

// Provider options are JSON object cells passed through to model provider adapters.
export const ProviderOptionsSchema = z.record(z.string(), z.json())

// Run config is the shared run-starting contract across web, CLI, and core.
export const RunConfigSchema = z.object({
  maxMessages: z.number().int().nonnegative(),
  modelId: z.string(),
  providerOptions: ProviderOptionsSchema,
  systemPromptId: z.string(),
  toolIds: z.array(z.string()),
})
export type RunConfig = z.infer<typeof RunConfigSchema>

// Run snapshots are stored as object cells so historical runs keep their original settings.
export const RunConfigSnapshotSchema = z.record(z.string(), z.json())

// Session config rows are durable, editable in-place defaults for future runs.
export const SessionRunConfigSchema = z.object({
  maxMessages: RunConfigSchema.shape.maxMessages.default(0),
  modelId: RunConfigSchema.shape.modelId.default(''),
  providerOptions: RunConfigSchema.shape.providerOptions.default({}),
  systemPromptId: RunConfigSchema.shape.systemPromptId.default(''),
  toolIds: RunConfigSchema.shape.toolIds.default([]),
})
