import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { SessionConfig } from '@tetra/store'
import type { UIMessage } from 'ai'
import { convertToModelMessages, readUIMessageStream, streamText } from 'ai'

export async function* infer(options: {
  apiKey: string
  assistantMessageId: string
  config: SessionConfig
  messages: UIMessage[]
  signal?: AbortSignal
}): AsyncGenerator<UIMessage> {
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

  // Convert to async iterable of UIMessage snapshots.
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
