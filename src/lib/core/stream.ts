import { DefaultChatTransport, readUIMessageStream } from 'ai'
import type { UIMessage } from 'ai'
import { nanoid } from 'nanoid'

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

      return readUIMessageStream<UIMessage>({ message: seed, stream: rawStream })
    },
  }
}

// --- Streaming Runtime ---

/**
 * Stream an AI response into TinyBase for the given session.
 *
 * This is the pure execution path — no queue, no dispatcher.
 * The caller (React action or future dispatcher) decides when to stream.
 *
 * Flow:
 * 1. Read agent config + message history from data
 * 2. Set session status to streaming
 * 3. Create assistant placeholder message
 * 4. Call transport, iterate stream, write partial updates
 * 5. On complete: set session idle
 * 6. On error: set session error, write error message
 * 7. On abort: clean up placeholder, set idle
 */
export const streamResponse = async (
  data: DataLayer,
  sessionId: string,
  transport: ChatTransport,
  signal?: AbortSignal,
) => {
  const session = data.sessions.getOrThrow(sessionId)
  const agent = data.agents.getOrThrow(session.agentId)
  const messages = data.messages.listBySession(sessionId)

  // Prepare assistant placeholder
  const assistantMessageId = `msg-${nanoid(10)}`
  const assistantSeq = session.lastSeq + 1
  const placeholder: UIMessage = {
    id: assistantMessageId,
    parts: [],
    role: 'assistant',
  }

  // Mark session as streaming, insert placeholder
  data.transaction(() => {
    data.messages.insert(assistantMessageId, sessionId, assistantSeq, placeholder)
    data.sessions.update(sessionId, {
      errorMessage: '',
      lastSeq: assistantSeq,
      status: 'streaming',
    })
  })

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

    // Write incremental updates
    for await (const nextMessage of stream) {
      data.messages.update(assistantMessageId, { message: nextMessage })
    }

    // Success
    data.sessions.update(sessionId, { errorMessage: '', status: 'idle' })
    console.log('[stream:streamResponse]', 'complete', { assistantMessageId, sessionId })
  } catch (error) {
    // Abort during stream initiation or iteration
    if (signal !== undefined && signal.aborted) {
      handleAbort(data, sessionId, assistantMessageId)
      return
    }

    // Real error
    const errorMessage = error instanceof Error ? error.message : 'Unknown streaming error'
    data.sessions.update(sessionId, { errorMessage, status: 'error' })
    console.error('[stream:streamResponse]', 'error', { errorMessage, sessionId })
  }
}

/**
 * Handle an aborted stream. Remove empty placeholders, set session idle.
 */
const handleAbort = (data: DataLayer, sessionId: string, assistantMessageId: string) => {
  const placeholder = data.messages.get(assistantMessageId)

  // Remove empty placeholder; keep partial content if the stream produced any
  if (placeholder !== null && placeholder.message.parts.length === 0) {
    data.messages.delete(assistantMessageId)
  }

  data.sessions.update(sessionId, { errorMessage: '', status: 'idle' })
  console.log('[stream:streamResponse]', 'aborted', { assistantMessageId, sessionId })
}
