import { z } from 'zod'

import type { StepRecord } from '#db'

// Parses OpenRouter-specific cost and token details from the raw provider metadata.
const ProviderRaw = z.object({
  completion_tokens_details: z
    .object({
      audio_tokens: z.number().default(0),
      image_tokens: z.number().default(0),
    })
    .default({ audio_tokens: 0, image_tokens: 0 }),
  cost: z.number().optional(),
  cost_details: z
    .object({
      upstream_inference_completions_cost: z.number().optional(),
      upstream_inference_prompt_cost: z.number().optional(),
    })
    .default({}),
  is_byok: z.boolean().default(false),
  prompt_tokens_details: z
    .object({
      audio_tokens: z.number().default(0),
      video_tokens: z.number().default(0),
    })
    .default({ audio_tokens: 0, video_tokens: 0 }),
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
    return {
      cost: {
        completion: raw.cost_details.upstream_inference_completions_cost ?? null,
        isByok: raw.is_byok,
        prompt: raw.cost_details.upstream_inference_prompt_cost ?? null,
        total: raw.cost ?? null,
      },
      createdAt: Date.now(),
      finishReason: event.finishReason,
      generationId: event.response.id,
      model: event.response.modelId,
      provider: event.providerMetadata?.openrouter?.provider ?? '',
      stepNumber: event.stepNumber,
      tokens: {
        audioIn: raw.prompt_tokens_details.audio_tokens,
        audioOut: raw.completion_tokens_details.audio_tokens,
        cacheRead: event.usage.inputTokenDetails.cacheReadTokens,
        cacheWrite: event.usage.inputTokenDetails.cacheWriteTokens,
        imageOut: raw.completion_tokens_details.image_tokens,
        input: event.usage.inputTokens,
        output: event.usage.outputTokens,
        reasoning: event.usage.outputTokenDetails.reasoningTokens,
        total: event.usage.totalTokens,
        videoIn: raw.prompt_tokens_details.video_tokens,
      },
    }
  })
