import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { UIMessage } from 'ai'
import { convertToModelMessages, readUIMessageStream, streamText } from 'ai'

import type { ChatTransport } from './stream.ts'

/**
 * OpenRouter transport. Calls streamText() directly — no server endpoint.
 * Reads the API key lazily via getter so the transport can be constructed
 * before the key is available.
 */
export const createOpenRouterTransport = (getApiKey: () => string | undefined): ChatTransport => ({
  async stream(config) {
    // Resolve API key at stream time
    const apiKey = getApiKey()
    if (apiKey === undefined || apiKey === '') {
      throw new Error('OpenRouter API key not configured. Add your key in Settings.')
    }

    const { assistantMessageId, config: sessionConfig, messages } = config
    const { modelId, providerOptions, systemPrompt } = sessionConfig

    console.log('[openrouter-transport]', 'start', { assistantMessageId, modelId })

    // Fresh provider instance per stream — key changes take effect immediately
    const openrouter = createOpenRouter({ apiKey })
    const modelMessages = await convertToModelMessages(messages)

    const result = streamText({
      abortSignal: config.signal,
      messages: modelMessages,
      model: openrouter(modelId),
      onFinish: ({ finishReason, usage }) => {
        console.log('[openrouter-transport]', 'finish', {
          assistantMessageId,
          finishReason,
          usage: usage.raw,
        })
      },
      providerOptions: providerOptions ? { openrouter: providerOptions } : undefined,
      system: systemPrompt,
    })

    // Convert to async iterable of UIMessage snapshots
    const seed: UIMessage = {
      id: assistantMessageId,
      parts: [],
      role: 'assistant',
    }

    return readUIMessageStream<UIMessage>({
      message: seed,
      stream: result.toUIMessageStream({
        generateMessageId: () => assistantMessageId,
        originalMessages: messages,
      }),
      terminateOnError: true,
    })
  },
})
