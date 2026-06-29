import { StepWarningSchema } from '@tetra/schemas/library'
import type { LibraryEntities } from '@tetra/schemas/library'
import { pickBy } from 'remeda'
import { z } from 'zod'

type StepRecord = LibraryEntities['steps']
type CapturedStep = Omit<StepRecord, 'id' | 'messageId' | 'runId' | 'sessionId'>
type StepRawUsage = NonNullable<StepRecord['raw']['usage']>

// OpenRouter can report null for some cost/token fields; normalize those to absent.
const ReportedNumber = z
  .number()
  .nullable()
  .optional()
  .transform((value) => value ?? undefined)

// OpenRouter sometimes omits or nulls nested prompt detail objects.
const PromptTokenDetails = z.preprocess(
  (value) => value ?? {},
  z.object({
    audio_tokens: ReportedNumber,
    cache_write_tokens: ReportedNumber,
    cached_tokens: ReportedNumber,
    video_tokens: ReportedNumber,
  }),
)

// Completion details can contain text-adjacent modalities that affect text derivation.
const CompletionTokenDetails = z.preprocess(
  (value) => value ?? {},
  z.object({
    audio_tokens: ReportedNumber,
    image_tokens: ReportedNumber,
    reasoning_tokens: ReportedNumber,
  }),
)

// OpenRouter raw cost details can carry BYOK/upstream and prompt/completion splits.
const CostDetails = z.preprocess(
  (value) => value ?? {},
  z.object({
    upstream_inference_completions_cost: ReportedNumber,
    upstream_inference_cost: ReportedNumber,
    upstream_inference_prompt_cost: ReportedNumber,
  }),
)

// Parse only the raw fields we interpret; raw.usage below preserves the full payload.
const ProviderRaw = z.object({
  completion_tokens_details: CompletionTokenDetails,
  cost: ReportedNumber,
  cost_details: CostDetails,
  is_byok: z.boolean().optional().default(false),
  prompt_tokens_details: PromptTokenDetails,
})
type ProviderRaw = z.infer<typeof ProviderRaw>

// Keep provider metadata narrow: it is a display/debug copy, not the accounting source.
const ProviderMetadata = z.looseObject({
  openrouter: z
    .looseObject({
      provider: z.string().optional(),
    })
    .optional(),
})

// Parse the AI SDK step/onStepFinish shape, not UI message stream lifecycle chunks.
const StepEventShape = z.object({
  finishReason: z.string(),
  model: z.object({ modelId: z.string() }).optional(),
  providerMetadata: ProviderMetadata.optional(),
  rawFinishReason: z.string().optional(),
  response: z.object({ id: z.string(), modelId: z.string() }),
  stepNumber: z.number(),
  usage: z.object({
    inputTokenDetails: z
      .object({
        cacheReadTokens: z.number().optional(),
        cacheWriteTokens: z.number().optional(),
        noCacheTokens: z.number().optional(),
      })
      .default({}),
    inputTokens: z.number().optional(),
    outputTokenDetails: z
      .object({
        reasoningTokens: z.number().optional(),
        textTokens: z.number().optional(),
      })
      .default({}),
    outputTokens: z.number().optional(),
    raw: z.unknown().optional(),
    totalTokens: z.number().optional(),
  }),
  warnings: z.array(StepWarningSchema).optional(),
})
type StepEventShape = z.infer<typeof StepEventShape>

export const StepEvent = StepEventShape.transform(captureStep)

function captureStep(event: StepEventShape): CapturedStep {
  // The SDK normalizes counts, but OpenRouter-specific cost and modality details live in raw.
  const providerRaw = ProviderRaw.parse(event.usage.raw ?? {})

  // Store one immutable accounting row; run/message/session ids are added by the caller.
  return {
    cost: withCurrency(captureCost(providerRaw)),
    createdAt: Date.now(),
    finishReason: event.finishReason,
    generationId: event.response.id,
    model: event.response.modelId,
    provider: event.providerMetadata?.openrouter?.provider ?? '',
    raw: captureRaw(event),
    stepNumber: event.stepNumber,
    usage: {
      input: captureInputUsage(event.usage, providerRaw),
      output: captureOutputUsage(event.usage, providerRaw),
      ...pickBy({ total: event.usage.totalTokens }, isStoredNumber),
    },
    warnings: event.warnings ?? [],
  }
}

function captureRaw(event: StepEventShape): StepRecord['raw'] {
  // Keep provider-native values together instead of minting top-level cells for each upstream detail.
  return {
    ...(event.rawFinishReason !== undefined && { finishReason: event.rawFinishReason }),
    ...(event.usage.raw !== undefined && { usage: parseRawUsage(event.usage.raw) }),
  }
}

function parseRawUsage(raw: unknown): StepRawUsage {
  // Fail loudly if a provider gives a non-JSON raw usage shape.
  return z.record(z.string(), z.json()).parse(raw)
}

function captureInputUsage(
  usage: StepEventShape['usage'],
  raw: ProviderRaw,
): StepRecord['usage']['input'] {
  // Use exclusive input buckets so displayed categories do not add up past input total.
  const total = usage.inputTokens
  const cacheRead =
    usage.inputTokenDetails.cacheReadTokens ?? raw.prompt_tokens_details.cached_tokens
  const cacheWrite =
    usage.inputTokenDetails.cacheWriteTokens ?? raw.prompt_tokens_details.cache_write_tokens
  const noCache =
    total === undefined
      ? usage.inputTokenDetails.noCacheTokens
      : Math.max(0, total - (cacheRead ?? 0) - (cacheWrite ?? 0))

  // Omit missing/zero fields so step records stay sparse.
  return pickBy({ cacheRead, cacheWrite, noCache, total }, isStoredNumber)
}

function captureOutputUsage(
  usage: StepEventShape['usage'],
  raw: ProviderRaw,
): StepRecord['usage']['output'] {
  // Prefer SDK text/reasoning details, then fall back to raw OpenRouter fields.
  const total = usage.outputTokens
  const audio = raw.completion_tokens_details.audio_tokens
  const image = raw.completion_tokens_details.image_tokens
  const reasoning =
    usage.outputTokenDetails.reasoningTokens ?? raw.completion_tokens_details.reasoning_tokens
  const text =
    usage.outputTokenDetails.textTokens ??
    (total === undefined
      ? undefined
      : Math.max(0, total - (reasoning ?? 0) - (audio ?? 0) - (image ?? 0)))

  // Omit missing/zero fields so step records stay sparse.
  return pickBy({ reasoning, text, total }, isStoredNumber)
}

function captureCost(raw: ProviderRaw): Omit<StepRecord['cost'], 'currency'> {
  // Compact renderable costs live on the step; exact provider details remain in raw.usage.
  return pickBy(
    {
      input: raw.cost_details.upstream_inference_prompt_cost,
      output: raw.cost_details.upstream_inference_completions_cost,
      total: raw.cost ?? raw.cost_details.upstream_inference_cost,
    },
    (value) => value !== undefined,
  )
}

function withCurrency(cost: Omit<StepRecord['cost'], 'currency'>): StepRecord['cost'] {
  // Currency is meaningful only when at least one numeric cost is present.
  if (Object.keys(cost).length === 0) {
    return {}
  }

  // OpenRouter usage/cost fields are denominated in USD.
  return { currency: 'USD', ...cost }
}

function isStoredNumber(value: number | undefined): boolean {
  // Missing fields mean "not reported"; zero fields are not useful in the sparse step row.
  return value !== undefined && value !== 0
}
