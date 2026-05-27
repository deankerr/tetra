import { expect, test } from 'bun:test'

import { StepEvent } from './steps.ts'

test('StepEvent preserves raw OpenRouter usage while storing exclusive render buckets', () => {
  // This mirrors the live OpenRouter shape captured by the sdk-probe usage script.
  const step = StepEvent.parse({
    finishReason: 'tool-calls',
    providerMetadata: { openrouter: { provider: 'OpenAI' } },
    rawFinishReason: 'tool_calls',
    response: { id: 'gen-test', modelId: 'openai/gpt-5.4-nano-20260317' },
    stepNumber: 1,
    usage: {
      inputTokenDetails: {
        cacheReadTokens: 3,
        cacheWriteTokens: 2,
        noCacheTokens: 7,
      },
      inputTokens: 10,
      outputTokenDetails: {
        reasoningTokens: 2,
      },
      outputTokens: 10,
      raw: {
        completion_tokens: 10,
        completion_tokens_details: {
          audio_tokens: 1,
          image_tokens: 1,
          reasoning_tokens: 2,
        },
        cost: 0.3,
        cost_details: {
          upstream_inference_completions_cost: 0.2,
          upstream_inference_cost: 0.3,
          upstream_inference_prompt_cost: 0.1,
        },
        is_byok: false,
        prompt_tokens: 10,
        prompt_tokens_details: {
          audio_tokens: 0,
          cache_write_tokens: 2,
          cached_tokens: 3,
          video_tokens: 0,
        },
        total_tokens: 20,
      },
      totalTokens: 20,
    },
    warnings: [{ details: 'temperature ignored', feature: 'temperature', type: 'unsupported' }],
  })

  // Cache-write tokens are their own bucket; noCache must not double-count them.
  expect(step).toMatchObject({
    cost: { currency: 'USD', input: 0.1, output: 0.2, total: 0.3 },
    finishReason: 'tool-calls',
    generationId: 'gen-test',
    model: 'openai/gpt-5.4-nano-20260317',
    provider: 'OpenAI',
    raw: {
      finishReason: 'tool_calls',
      usage: {
        prompt_tokens_details: {
          cache_write_tokens: 2,
          cached_tokens: 3,
        },
      },
    },
    stepNumber: 1,
    usage: {
      input: { cacheRead: 3, cacheWrite: 2, noCache: 5, total: 10 },
      output: { reasoning: 2, text: 6, total: 10 },
      total: 20,
    },
    warnings: [{ details: 'temperature ignored', feature: 'temperature', type: 'unsupported' }],
  })
})

test('StepEvent preserves future warning fields without strict warning discrimination', () => {
  // AI SDK warnings are structured, but upstream can add warning variants over time.
  const step = StepEvent.parse({
    finishReason: 'stop',
    response: { id: 'gen-test', modelId: 'openai/gpt-5.4-nano-20260317' },
    stepNumber: 0,
    usage: {},
    warnings: [{ future: { nested: true }, type: 'provider-added-this-later' }],
  })

  expect(step.warnings).toEqual([{ future: { nested: true }, type: 'provider-added-this-later' }])
})

test('StepEvent stores empty raw and warning containers when providers report neither', () => {
  // These containers are always present so readers only check for the specific key they need.
  const step = StepEvent.parse({
    finishReason: 'stop',
    response: { id: 'gen-test', modelId: 'openai/gpt-5.4-nano-20260317' },
    stepNumber: 0,
    usage: {},
  })

  expect(step.raw).toEqual({})
  expect(step.warnings).toEqual([])
})

test('StepEvent prefers SDK output text tokens when reported', () => {
  // Explicit text tokens are better than deriving text from total minus known output modalities.
  const step = StepEvent.parse({
    finishReason: 'stop',
    response: { id: 'gen-test', modelId: 'openai/gpt-5.4-nano-20260317' },
    stepNumber: 0,
    usage: {
      outputTokenDetails: {
        reasoningTokens: 4,
        textTokens: 9,
      },
      outputTokens: 20,
      raw: {
        completion_tokens_details: {
          image_tokens: 3,
          reasoning_tokens: 4,
        },
      },
    },
  })

  // If the SDK says text is 9, store 9 even though raw modality math could derive 13.
  expect(step.usage.output).toEqual({ reasoning: 4, text: 9, total: 20 })
})
