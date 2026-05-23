import { pickBy } from 'remeda'
import { z } from 'zod'

import type { StepRecord } from '#db'

// Parses OpenRouter-specific cost and token details from the raw provider metadata.
const ProviderRaw = z.object({
  completion_tokens_details: z
    .object({
      audio_tokens: z.number().optional(),
      image_tokens: z.number().optional(),
      reasoning_tokens: z.number().optional(),
    })
    .default({}),
  cost: z.number().optional(),
  cost_details: z
    .object({
      upstream_inference_completions_cost: z.number().optional(),
      upstream_inference_cost: z.number().nullable().optional(),
      upstream_inference_prompt_cost: z.number().optional(),
    })
    .default({}),
  is_byok: z.boolean().default(false),
  prompt_tokens_details: z
    .object({
      audio_tokens: z.number().optional(),
      cache_write_tokens: z.number().optional(),
      cached_tokens: z.number().optional(),
      video_tokens: z.number().optional(),
    })
    .default({}),
})

export const StepEvent = z
  .object({
    finishReason: z.string(),
    model: z.object({ modelId: z.string() }).optional(),
    providerMetadata: z
      .object({ openrouter: z.object({ provider: z.string() }).optional() })
      .optional(),
    response: z.object({ id: z.string(), modelId: z.string() }),
    stepNumber: z.number(),
    usage: z.object({
      inputTokenDetails: z
        .object({ cacheReadTokens: z.number().default(0), cacheWriteTokens: z.number().default(0) })
        .default({ cacheReadTokens: 0, cacheWriteTokens: 0 }),
      inputTokens: z.number().default(0),
      outputTokenDetails: z
        .object({ reasoningTokens: z.number().default(0) })
        .default({ reasoningTokens: 0 }),
      outputTokens: z.number().default(0),
      raw: z.unknown().optional(),
      totalTokens: z.number().default(0),
    }),
  })
  .transform((event): StepRecord => {
    const raw = ProviderRaw.parse(event.usage.raw ?? {})
    const inputAudio = raw.prompt_tokens_details.audio_tokens
    const inputCacheRead =
      event.usage.inputTokenDetails.cacheReadTokens || raw.prompt_tokens_details.cached_tokens
    const inputCacheWrite =
      event.usage.inputTokenDetails.cacheWriteTokens || raw.prompt_tokens_details.cache_write_tokens
    const inputVideo = raw.prompt_tokens_details.video_tokens
    const inputNoCache = Math.max(0, event.usage.inputTokens - (inputCacheRead ?? 0)) || undefined
    const inputText =
      Math.max(0, (inputNoCache ?? 0) - (inputAudio ?? 0) - (inputVideo ?? 0)) || undefined
    const outputAudio = raw.completion_tokens_details.audio_tokens
    const outputImage = raw.completion_tokens_details.image_tokens
    const outputReasoning =
      event.usage.outputTokenDetails.reasoningTokens ||
      raw.completion_tokens_details.reasoning_tokens
    const outputText =
      Math.max(
        0,
        event.usage.outputTokens - (outputReasoning ?? 0) - (outputAudio ?? 0) - (outputImage ?? 0),
      ) || undefined

    return {
      cost: {
        currency: 'USD',
        isByok: raw.is_byok,
        ...pickBy(
          {
            inputTotal: raw.cost_details.upstream_inference_prompt_cost,
            outputTotal: raw.cost_details.upstream_inference_completions_cost,
            total: raw.cost,
          },
          (v) => v !== undefined,
        ),
      },
      createdAt: Date.now(),
      finishReason: event.finishReason,
      generationId: event.response.id,
      model: event.response.modelId,
      provider: event.providerMetadata?.openrouter?.provider ?? '',
      stepNumber: event.stepNumber,
      tokens: {
        inputTotal: event.usage.inputTokens,
        outputTotal: event.usage.outputTokens,
        total: event.usage.totalTokens,
        ...pickBy(
          {
            inputAudio,
            inputCacheRead,
            inputCacheWrite,
            inputNoCache,
            inputText,
            inputVideo,
            outputAudio,
            outputImage,
            outputReasoning,
            outputText,
          },
          (v) => v !== undefined && v !== 0,
        ),
      },
    }
  })
