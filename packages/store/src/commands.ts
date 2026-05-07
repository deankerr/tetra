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

export type UpdateSessionConfigArgs = {
  patch: Partial<SessionConfig>
  sessionId: string
}

export type SendMessageArgs = {
  sessionId: string
  text: string
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

  updateSessionConfig(args: UpdateSessionConfigArgs) {
    const { patch, sessionId } = args
    const session = data.sessions.getOrThrow(sessionId)
    const nextConfig = { ...session.config, ...patch }
    data.sessions.update(sessionId, { config: nextConfig })
    console.log('[store:updateSessionConfig]', 'updated', { sessionId })
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
    const { sessionId, text } = args
    const session = data.sessions.getOrThrow(sessionId)

    // Concurrency guard: one active request per session.
    const active = data.requests.getActiveForSession(sessionId)
    if (active !== null) {
      console.log('[store:sendMessage]', 'skipped: active request exists', { sessionId })
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
      data.requests.insert(requestId, sessionId, messageId, assistantMessageId, session.config)
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
