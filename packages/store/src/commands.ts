import type { DataLayer } from './tables/index.ts'
import type { SessionConfig } from './utils.ts'
import { generateId, truncate } from './utils.ts'

export type Commands = ReturnType<typeof bindCommands>

export type CreateSessionArgs = {
  title?: string
}

export type DeleteSessionArgs = {
  sessionId: string
}

export type UpdateSessionArgs = {
  sessionId: string
  title: string
}

export type SendMessageArgs = {
  config?: SessionConfig
  sessionId: string
  text: string
  targetExecutorId: string
}

export type RegenerateArgs = {
  config?: SessionConfig
  sessionId: string
  targetExecutorId: string
}

export type CancelRequestArgs = {
  sessionId: string
}

export const bindCommands = (data: DataLayer) => ({
  createSession(args: CreateSessionArgs = {}) {
    const sessionId = generateId.session()
    data.sessions.insert(sessionId, args.title)

    console.log('[store:createSession]', 'created', { sessionId })
    return sessionId
  },

  deleteSession(args: DeleteSessionArgs) {
    const { sessionId } = args
    data.sessions.getOrThrow(sessionId)

    // Cancel any active request before deleting.
    const active = data.requests.getActiveForSession(sessionId)
    if (active !== null) {
      data.requests.update(active.id, { status: 'cancelled' })
    }

    // Cascade delete messages and requests.
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

    console.log('[store:deleteSession]', 'deleted', { sessionId })
  },

  updateSession(args: UpdateSessionArgs) {
    const { sessionId, title } = args
    data.sessions.update(sessionId, { title })
    console.log('[store:updateSession]', 'updated', { sessionId, title })
  },

  addMessage(args: { sessionId: string; text: string }) {
    const { sessionId, text } = args
    const session = data.sessions.getOrThrow(sessionId)

    const messageId = generateId.message()
    const userSeq = session.lastSeq + 1

    // Auto-title: use first user message text.
    const isFirstMessage = session.lastSeq === 0
    const title = isFirstMessage ? truncate(text) : session.title

    data.transaction(() => {
      data.messages.insert(messageId, sessionId, userSeq, 'user', [{ text, type: 'text' }])
      data.sessions.update(sessionId, { lastSeq: userSeq, title })
    })

    console.log('[store:addMessage]', {
      messageId,
      sessionId,
      userSeq,
    })

    return { messageId, seq: userSeq }
  },

  sendMessage(args: SendMessageArgs) {
    const { config, sessionId, targetExecutorId, text } = args
    const session = data.sessions.getOrThrow(sessionId)

    // Concurrency guard: one active request per session.
    const active = data.requests.getActiveForSession(sessionId)
    if (active !== null) {
      console.log('[store:sendMessage]', 'skipped: active request exists', { sessionId })
      return null
    }

    // Resolve config: caller override -> latest request. No silent default.
    const resolvedConfig = config ?? data.requests.getLatestConfigForSession(sessionId)
    if (resolvedConfig === null) {
      console.error('[store:sendMessage]', 'no config available', { sessionId })
      return null
    }

    const messageId = generateId.message()
    const assistantMessageId = generateId.message()
    const requestId = generateId.request()
    const userSeq = session.lastSeq + 1
    const assistantSeq = session.lastSeq + 2

    // Auto-title: use first user message text.
    const isFirstMessage = session.lastSeq === 0
    const title = isFirstMessage ? truncate(text) : session.title

    // Atomic: user message, assistant placeholder, request with config snapshot.
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
        targetExecutorId,
      )
    })

    console.log('[store:sendMessage]', 'sent', {
      assistantMessageId,
      messageId,
      requestId,
      sessionId,
      userSeq,
    })
    return { assistantMessageId, messageId, requestId, seq: assistantSeq }
  },

  regenerate(args: RegenerateArgs) {
    const { config, sessionId, targetExecutorId } = args

    // Guard: one active request per session.
    const active = data.requests.getActiveForSession(sessionId)
    if (active !== null) {
      console.log('[store:regenerate]', 'skipped: active request exists', { sessionId })
      return null
    }

    // Find last assistant message and the user message before it.
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

    // Resolve config: caller override -> latest request. No silent default.
    const resolvedConfig = config ?? data.requests.getLatestConfigForSession(sessionId)
    if (resolvedConfig === null) {
      console.error('[store:regenerate]', 'no config available', { sessionId })
      return null
    }

    const assistantMessageId = generateId.message()
    const requestId = generateId.request()

    // Atomic: delete old assistant, insert new placeholder and targeted request.
    data.transaction(() => {
      data.messages.delete(lastAssistant.id)
      data.messages.insert(assistantMessageId, sessionId, lastAssistant.seq, 'assistant', [])
      data.requests.insert(
        requestId,
        sessionId,
        userMessage.id,
        assistantMessageId,
        resolvedConfig,
        targetExecutorId,
      )
    })

    console.log('[store:regenerate]', 'regenerating', {
      assistantMessageId,
      requestId,
      sessionId,
    })
    return { assistantMessageId, requestId }
  },

  cancelRequest(args: CancelRequestArgs) {
    const { sessionId } = args
    const active = data.requests.getActiveForSession(sessionId)
    if (active === null) {
      return
    }

    data.requests.update(active.id, { status: 'cancelled' })
    console.log('[store:cancelRequest]', 'cancelled', { requestId: active.id, sessionId })
  },

  deleteMessage(args: { messageId: string }) {
    const { messageId } = args
    const message = data.messages.get(messageId)
    if (message === null) {
      return
    }

    const requestIds = data.requests.listIdsBySession(message.sessionId)

    data.transaction(() => {
      for (const rid of requestIds) {
        const req = data.requests.get(rid)
        if (req === null) {
          continue
        }
        if (req.assistantMessageId === messageId || req.messageId === messageId) {
          data.requests.delete(rid)
          if (req.assistantMessageId !== messageId) {
            data.messages.delete(req.assistantMessageId)
          }
          if (req.messageId !== messageId) {
            data.messages.delete(req.messageId)
          }
          break
        }
      }
      data.messages.delete(messageId)
    })

    console.log('[store:deleteMessage]', 'deleted', { messageId })
  },
})
