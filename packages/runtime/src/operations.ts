import type { DataLayer } from './tables/index.ts'
import type { SessionConfig } from './utils.ts'
import { generateId, truncate } from './utils.ts'

// --- Bound Operations ---

export type Operations = ReturnType<typeof bindOperations>

export const bindOperations = (data: DataLayer, runtimeId: string) => ({
  // --- Session Operations ---

  createSession() {
    const sessionId = generateId.session()
    data.sessions.insert(sessionId)

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

    console.log('[operations:deleteSession]', 'deleted', { sessionId })
  },

  updateSession(sessionId: string, title: string) {
    data.sessions.update(sessionId, { title })
    console.log('[operations:updateSession]', 'updated', { sessionId, title })
  },

  // --- Message Operations ---

  sendMessage(sessionId: string, text: string, config?: SessionConfig) {
    const session = data.sessions.getOrThrow(sessionId)

    // Concurrency guard — one active request per session
    const active = data.requests.getActiveForSession(sessionId)
    if (active !== null) {
      console.log('[operations:sendMessage]', 'skipped — active request exists', { sessionId })
      return null
    }

    // Resolve config: caller override → latest request. No silent default.
    const resolvedConfig = config ?? data.requests.getLatestConfigForSession(sessionId)
    if (resolvedConfig === null) {
      console.error('[operations:sendMessage]', 'no config available', { sessionId })
      return null
    }

    const messageId = generateId.message()
    const assistantMessageId = generateId.message()
    const requestId = generateId.request()
    const userSeq = session.lastSeq + 1
    const assistantSeq = session.lastSeq + 2

    // Auto-title: use first user message text
    const isFirstMessage = session.lastSeq === 0
    const title = isFirstMessage ? truncate(text) : session.title

    // Atomic: user msg + assistant placeholder + request with config snapshot
    data.transaction(() => {
      data.messages.insert(messageId, sessionId, userSeq, 'user', [{ text, type: 'text' }])
      data.messages.insert(assistantMessageId, sessionId, assistantSeq, 'assistant', [])
      data.sessions.update(sessionId, { lastSeq: assistantSeq, title })
      data.requests.insert(
        requestId,
        sessionId,
        messageId,
        assistantMessageId,
        resolvedConfig,
        runtimeId,
      )
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

  regenerate(sessionId: string, config?: SessionConfig) {
    // Guard: one active request per session
    const active = data.requests.getActiveForSession(sessionId)
    if (active !== null) {
      console.log('[operations:regenerate]', 'skipped — active request exists', { sessionId })
      return null
    }

    // Find last assistant message and the user message before it
    const messages = data.messages.listBySession(sessionId)
    const lastAssistant = messages.findLast((m) => m.role === 'assistant')
    if (lastAssistant === undefined) {
      return null
    }
    const lastAssistantIdx = messages.indexOf(lastAssistant)
    const userMessage = messages.slice(0, lastAssistantIdx).findLast((m) => m.role === 'user')
    if (userMessage === undefined) {
      return null
    }

    // Resolve config: caller override → latest request. No silent default.
    const resolvedConfig = config ?? data.requests.getLatestConfigForSession(sessionId)
    if (resolvedConfig === null) {
      console.error('[operations:regenerate]', 'no config available', { sessionId })
      return null
    }

    const assistantMessageId = generateId.message()
    const requestId = generateId.request()

    // Atomic: delete old assistant, insert new placeholder + request with config
    data.transaction(() => {
      data.messages.delete(lastAssistant.id)
      data.messages.insert(assistantMessageId, sessionId, lastAssistant.seq, 'assistant', [])
      data.requests.insert(
        requestId,
        sessionId,
        userMessage.id,
        assistantMessageId,
        resolvedConfig,
        runtimeId,
      )
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
