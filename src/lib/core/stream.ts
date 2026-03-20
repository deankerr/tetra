import type { UIMessage } from 'ai'

import type { DataLayer } from '@/lib/core/data'
import type { SessionConfig } from '@/lib/shared/session-config'

// --- Transport Interface ---

export type StreamConfig = {
  assistantMessageId: string
  config: SessionConfig
  messages: UIMessage[]
  sessionId: string
  signal?: AbortSignal
}

export type ChatTransport = {
  stream: (config: StreamConfig) => Promise<AsyncIterable<UIMessage>>
}

// --- Result Type ---

export type StreamResult =
  | { status: 'completed' }
  | { status: 'aborted' }
  | { status: 'error'; errorMessage: string }

// --- Streaming Runtime ---

/**
 * Stream an AI response into TinyBase for the given session.
 *
 * The assistant placeholder message already exists (created by sendMessage).
 * This function streams content into it and returns the outcome.
 */
export const streamResponse = async (
  data: DataLayer,
  sessionId: string,
  assistantMessageId: string,
  config: SessionConfig,
  transport: ChatTransport,
  signal?: AbortSignal,
): Promise<StreamResult> => {
  // Load only recent history, excluding the empty assistant placeholder
  const messages = data.messages.listRecentBySession(sessionId, config.maxMessages, [
    assistantMessageId,
  ])

  console.log('[stream:streamResponse]', 'started', {
    assistantMessageId,
    maxMessages: config.maxMessages ?? 'all',
    messageCount: messages.length,
    sessionId,
  })

  try {
    // Start the stream
    const stream = await transport.stream({
      assistantMessageId,
      config,
      messages,
      sessionId,
      signal,
    })

    // Write incremental updates into existing placeholder
    let received = false
    for await (const nextMessage of stream) {
      received = true
      data.messages.writeStreamChunk(assistantMessageId, nextMessage)
    }

    // Empty stream — model returned nothing
    if (!received) {
      console.error('[stream:streamResponse]', 'empty stream', { assistantMessageId, sessionId })
      return { errorMessage: 'Empty response from model', status: 'error' }
    }

    console.log('[stream:streamResponse]', 'complete', { assistantMessageId, sessionId })
    return { status: 'completed' }
  } catch (error) {
    // Abort during stream initiation or iteration
    if (signal !== undefined && signal.aborted) {
      console.log('[stream:streamResponse]', 'aborted', { assistantMessageId, sessionId })
      return { status: 'aborted' }
    }

    // Real error — keep the placeholder so the error block renders in the message list
    const errorMessage = error instanceof Error ? error.message : 'Unknown streaming error'
    console.error('[stream:streamResponse]', 'error', { errorMessage, sessionId })
    return { errorMessage, status: 'error' }
  }
}
