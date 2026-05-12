import type { JSONObject } from '@ai-sdk/provider'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { UIMessage } from 'ai'
import { convertToModelMessages, readUIMessageStream, streamText } from 'ai'

export interface InferenceConfig {
  maxMessages?: number
  modelId: string
  providerOptions?: JSONObject
  systemPrompt?: string
}

export interface StreamInferenceArgs {
  apiKey: string
  assistantMessageId: string
  config: InferenceConfig
  messages: UIMessage[]
  signal?: AbortSignal
}

export class MissingProviderSecretError extends Error {
  constructor() {
    super('OpenRouter API key not configured. Add your key in Settings.')
    this.name = 'MissingProviderSecretError'
  }
}

export async function* streamInference(options: StreamInferenceArgs): AsyncGenerator<UIMessage> {
  const { apiKey, assistantMessageId, config, messages, signal } = options
  const { modelId, providerOptions, systemPrompt } = config

  // Build provider and convert messages to model format.
  const openrouter = createOpenRouter({ apiKey })
  const modelMessages = await convertToModelMessages(messages)

  // Start streaming inference.
  const result = streamText({
    abortSignal: signal,
    messages: modelMessages,
    model: openrouter(modelId),
    providerOptions: providerOptions ? { openrouter: providerOptions } : undefined,
    system: systemPrompt,
  })

  // Convert the provider stream into AI SDK UIMessage snapshots.
  const stream = readUIMessageStream<UIMessage>({
    message: {
      id: assistantMessageId,
      parts: [],
      role: 'assistant',
    },
    stream: result.toUIMessageStream({
      generateMessageId: () => assistantMessageId,
      sendReasoning: true,
    }),
    terminateOnError: true,
  })

  yield* stream
}
