import type { UIMessage } from 'ai'

import type { DataLayer } from '@/lib/core/data'
import type { InferenceConfig } from '@/lib/core/data/config'
import { id } from '@/lib/core/id'

// --- Text Helpers ---

const isTextPart = (part: UIMessage['parts'][number]): part is { text: string; type: 'text' } =>
  part.type === 'text'

export const getMessageText = (message: UIMessage) =>
  message.parts
    .filter(isTextPart)
    .map((part) => part.text)
    .join('')

const generateTitle = (text: string, maxLength = 128) => {
  const normalized = text.replaceAll(/\s+/g, ' ').trim()
  if (normalized === '') {
    return 'New session'
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength - 1)}…`
}

// --- Bound Operations ---

export type Operations = ReturnType<typeof bindOperations>

export const bindOperations = (data: DataLayer) => ({
  // --- Session Operations ---

  createSession() {
    const sessionId = id.session()

    data.transaction(() => {
      data.sessions.insert(sessionId)
      data.store.setValue('activeSessionId', sessionId)
    })

    console.log('[operations:createSession]', 'created', { sessionId })
    return sessionId
  },

  deleteSession(sessionId: string) {
    data.sessions.getOrThrow(sessionId)

    // Cancel any active request before deleting
    const active = data.requests.getActiveForSession(sessionId)
    if (active !== null) {
      data.requests.update(active.id, { status: 'cancelled' })
    }

    // Cascade delete messages and requests
    const messageIds = data.messages.listIdsBySession(sessionId)
    const requestIds = data.requests.listIdsBySession(sessionId)

    data.transaction(() => {
      for (const mid of messageIds) {
        data.messages.delete(mid)
      }
      for (const rid of requestIds) {
        data.requests.delete(rid)
      }
      data.sessions.delete(sessionId)
    })

    // If we deleted the active session, select another or create a new one
    const currentActive = data.store.getValue('activeSessionId') ?? ''
    if (currentActive === sessionId) {
      const remaining = data.sessions.listIdsByRecency()
      if (remaining.length > 0 && remaining[0] !== undefined) {
        data.store.setValue('activeSessionId', remaining[0])
      } else {
        this.createSession()
      }
    }

    console.log('[operations:deleteSession]', 'deleted', { sessionId })
  },

  updateSession(sessionId: string, title: string) {
    data.sessions.update(sessionId, { title })
    console.log('[operations:updateSession]', 'updated', { sessionId, title })
  },

  selectSession(sessionId: string) {
    data.sessions.getOrThrow(sessionId)
    data.store.setValue('activeSessionId', sessionId)

    console.log('[operations:selectSession]', 'selected', { sessionId })
  },

  // --- Message Operations ---

  sendMessage(sessionId: string, text: string, config?: InferenceConfig) {
    const session = data.sessions.getOrThrow(sessionId)

    // Concurrency guard — one active request per session
    const active = data.requests.getActiveForSession(sessionId)
    if (active !== null) {
      console.log('[operations:sendMessage]', 'skipped — active request exists', { sessionId })
      return null
    }

    // Resolve config: caller override → latest request → app default
    const resolvedConfig = config ?? data.requests.getLatestConfigForSession(sessionId)

    const messageId = id.message()
    const assistantMessageId = id.message()
    const requestId = id.request()
    const userSeq = session.lastSeq + 1
    const assistantSeq = session.lastSeq + 2

    const userMessage: UIMessage = {
      id: messageId,
      parts: [{ text, type: 'text' }],
      role: 'user',
    }

    const assistantPlaceholder: UIMessage = {
      id: assistantMessageId,
      parts: [],
      role: 'assistant',
    }

    // Auto-title: use first user message text
    const isFirstMessage = session.lastSeq === 0
    const title = isFirstMessage ? generateTitle(text) : session.title

    // Atomic: user msg + assistant placeholder + request with config snapshot
    data.transaction(() => {
      data.messages.insert(messageId, sessionId, userSeq, userMessage)
      data.messages.insert(assistantMessageId, sessionId, assistantSeq, assistantPlaceholder)
      data.sessions.update(sessionId, { lastSeq: assistantSeq, title })
      data.requests.insert(requestId, sessionId, messageId, assistantMessageId, resolvedConfig)
    })

    console.log('[operations:sendMessage]', 'sent', {
      assistantMessageId,
      messageId,
      requestId,
      sessionId,
      userSeq,
    })
    return { assistantMessageId, messageId, requestId, seq: assistantSeq }
  },

  regenerate(sessionId: string, config?: InferenceConfig) {
    // Guard: one active request per session
    const active = data.requests.getActiveForSession(sessionId)
    if (active !== null) {
      console.log('[operations:regenerate]', 'skipped — active request exists', { sessionId })
      return null
    }

    // Find last assistant message and the user message before it
    const messages = data.messages.listBySession(sessionId)
    const lastAssistant = messages.findLast((m) => m.message.role === 'assistant')
    if (lastAssistant === undefined) {
      return null
    }
    const lastAssistantIdx = messages.indexOf(lastAssistant)
    const userMessage = messages
      .slice(0, lastAssistantIdx)
      .findLast((m) => m.message.role === 'user')
    if (userMessage === undefined) {
      return null
    }

    // Resolve config: caller override → latest request → app default
    const resolvedConfig = config ?? data.requests.getLatestConfigForSession(sessionId)

    const assistantMessageId = id.message()
    const requestId = id.request()

    const assistantPlaceholder: UIMessage = {
      id: assistantMessageId,
      parts: [],
      role: 'assistant',
    }

    // Atomic: delete old assistant, insert new placeholder + request with config
    data.transaction(() => {
      data.messages.delete(lastAssistant.id)
      data.messages.insert(assistantMessageId, sessionId, lastAssistant.seq, assistantPlaceholder)
      data.requests.insert(requestId, sessionId, userMessage.id, assistantMessageId, resolvedConfig)
    })

    console.log('[operations:regenerate]', 'regenerating', {
      assistantMessageId,
      requestId,
      sessionId,
    })
    return { assistantMessageId, requestId }
  },

  cancelRequest(sessionId: string) {
    const active = data.requests.getActiveForSession(sessionId)
    if (active === null) {
      return
    }

    data.requests.update(active.id, { status: 'cancelled' })
    console.log('[operations:cancelRequest]', 'cancelled', { requestId: active.id, sessionId })
  },
})

// --- Boot-only ---

/** Ensure a valid active session exists. Called once during boot. */
export const ensureDefaults = (data: DataLayer, createSession: () => string) => {
  // Validate or fix activeSessionId
  const activeSessionId = data.store.getValue('activeSessionId') ?? ''
  if (activeSessionId !== '' && data.sessions.get(activeSessionId) !== null) {
    return
  }

  // Try to pick an existing session
  const existingIds = data.sessions.listIdsByRecency()
  if (existingIds.length > 0 && existingIds[0] !== undefined) {
    data.store.setValue('activeSessionId', existingIds[0])
    return
  }

  // Create a fresh session
  createSession()
}
