import { DefaultChatTransport, readUIMessageStream } from 'ai'
import type { UIMessage } from 'ai'

import type { DataLayer } from '@/lib/core/data'
import type { Agent } from '@/lib/core/data/agents'

// --- Transport Interface ---

export type StreamConfig = {
  agent: Agent
  assistantMessageId: string
  messages: UIMessage[]
  sessionId: string
  signal?: AbortSignal
}

export type ChatTransport = {
  stream: (config: StreamConfig) => Promise<AsyncIterable<UIMessage>>
}

// --- Default Transport (AI SDK + OpenRouter) ---

/**
 * Wraps AI SDK's DefaultChatTransport for the /api/chat endpoint.
 * Handles the translation from our StreamConfig to AI SDK's sendMessages format.
 */
export const createDefaultTransport = (api = '/api/stream'): ChatTransport => {
  const inner = new DefaultChatTransport<UIMessage>({ api })

  return {
    async stream(config) {
      const rawStream = await inner.sendMessages({
        abortSignal: config.signal,
        body: {
          assistantMessageId: config.assistantMessageId,
          maxOutputTokens: config.agent.maxOutputTokens,
          model: config.agent.model,
          systemPrompt: config.agent.systemPrompt,
          temperature: config.agent.temperature,
        },
        chatId: config.sessionId,
        messageId: config.assistantMessageId,
        messages: config.messages,
        trigger: 'submit-message',
      })

      // readUIMessageStream yields incremental UIMessage snapshots
      const seed: UIMessage = {
        id: config.assistantMessageId,
        parts: [],
        role: 'assistant',
      }

      return readUIMessageStream<UIMessage>({
        message: seed,
        stream: rawStream,
        terminateOnError: true,
      })
    },
  }
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
 *
 * Flow:
 * 1. Read agent config + message history from data
 * 2. Call transport, iterate stream, write partial updates into existing placeholder
 * 3. On complete: return completed (or error if empty stream)
 * 4. On error: keep placeholder for error display in message list, return error
 * 5. On abort: clean up empty placeholder, return aborted
 */
export const streamResponse = async (
  data: DataLayer,
  sessionId: string,
  assistantMessageId: string,
  transport: ChatTransport,
  signal?: AbortSignal,
): Promise<StreamResult> => {
  const session = data.sessions.getOrThrow(sessionId)
  const agent = data.agents.getOrThrow(session.agentId)
  const messages = data.messages.listBySession(sessionId)

  console.log('[stream:streamResponse]', 'started', { assistantMessageId, sessionId })

  try {
    // Start the stream
    const stream = await transport.stream({
      agent,
      assistantMessageId,
      messages: messages.map((m) => m.message),
      sessionId,
      signal,
    })

    // Write incremental updates into existing placeholder
    let received = false
    for await (const nextMessage of stream) {
      received = true
      data.messages.update(assistantMessageId, { message: nextMessage })
    }

    // Empty stream — model returned nothing
    if (!received) {
      // Keep the placeholder so the error block renders in the message list
      console.error('[stream:streamResponse]', 'empty stream', { assistantMessageId, sessionId })
      return { errorMessage: 'Empty response from model', status: 'error' }
    }

    console.log('[stream:streamResponse]', 'complete', { assistantMessageId, sessionId })
    return { status: 'completed' }
  } catch (error) {
    // Abort during stream initiation or iteration
    if (signal !== undefined && signal.aborted) {
      removeEmptyPlaceholder(data, assistantMessageId)
      console.log('[stream:streamResponse]', 'aborted', { assistantMessageId, sessionId })
      return { status: 'aborted' }
    }

    // Real error — keep the placeholder so the error block renders in the message list
    const errorMessage = error instanceof Error ? error.message : 'Unknown streaming error'
    console.error('[stream:streamResponse]', 'error', { errorMessage, sessionId })
    return { errorMessage, status: 'error' }
  }
}

/** Remove assistant placeholder if it never received content. */
export const removeEmptyPlaceholder = (data: DataLayer, assistantMessageId: string) => {
  const placeholder = data.messages.get(assistantMessageId)
  if (placeholder !== null && placeholder.message.parts.length === 0) {
    data.messages.delete(assistantMessageId)
  }
}
