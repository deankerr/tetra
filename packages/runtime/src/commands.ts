import {
  DEFAULT_REQUEST_CONFIG,
  decodeMessage,
  decodeRequest,
  decodeSession,
  generateId,
} from '@tetra/store'

import { executeRequest } from './execution.ts'
import { titleFromText } from './title.ts'
import type {
  CreateSessionArgs,
  DeleteSessionArgs,
  RuntimeContext,
  SendMessageArgs,
  UpdateSessionArgs,
  UpdateSessionConfigArgs,
} from './types.ts'

export const createCommands = (context: RuntimeContext) => {
  const { indexes, store, transaction } = context

  return {
    addMessage(args: { sessionId: string; text: string }) {
      const { sessionId, text } = args
      if (!store.hasRow('sessions', sessionId)) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      const session = decodeSession(sessionId, store.getRow('sessions', sessionId))

      // Manual transcript edits append a user message without inference.
      const messageId = generateId.message()
      const userSeq = session.lastSeq + 1
      const isFirstMessage = session.lastSeq === 0
      const title = isFirstMessage ? titleFromText(text) : session.title
      const timestamp = Date.now()

      transaction(() => {
        store.setRow('messages', messageId, {
          createdAt: timestamp,
          parts: [{ text, type: 'text' }],
          role: 'user',
          seq: userSeq,
          sessionId,
          updatedAt: timestamp,
        })
        store.setPartialRow('sessions', sessionId, {
          lastSeq: userSeq,
          title,
          updatedAt: Date.now(),
        })
      })

      console.log('[runtime:addMessage]', {
        messageId,
        sessionId,
        userSeq,
      })

      return { messageId, seq: userSeq }
    },

    createSession(args: CreateSessionArgs = {}) {
      const sessionId = generateId.session()
      const timestamp = Date.now()

      store.setRow('sessions', sessionId, {
        config: DEFAULT_REQUEST_CONFIG,
        createdAt: timestamp,
        lastSeq: 0,
        title: args.title ?? '',
        updatedAt: timestamp,
      })

      console.log('[runtime:createSession]', 'created', { sessionId })
      return sessionId
    },

    deleteMessage(args: { messageId: string }) {
      const { messageId } = args
      if (!store.hasRow('messages', messageId)) {
        return
      }

      // Delete a request-linked message with its paired transcript row.
      const message = decodeMessage(messageId, store.getRow('messages', messageId))
      const requestIds = indexes.getSliceRowIds('requestsBySession', message.sessionId)

      transaction(() => {
        for (const rid of requestIds) {
          if (!store.hasRow('requests', rid)) {
            continue
          }

          const req = decodeRequest(rid, store.getRow('requests', rid))
          if (req.assistantMessageId === messageId || req.messageId === messageId) {
            store.delRow('requests', rid)
            if (req.assistantMessageId !== messageId) {
              store.delRow('messages', req.assistantMessageId)
            }
            if (req.messageId !== messageId) {
              store.delRow('messages', req.messageId)
            }
            break
          }
        }
        store.delRow('messages', messageId)
      })

      console.log('[runtime:deleteMessage]', 'deleted', { messageId })
    },

    deleteSession(args: DeleteSessionArgs) {
      const { sessionId } = args
      if (!store.hasRow('sessions', sessionId)) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      // Cascade session deletion through messages and request records.
      const messageIds = indexes.getSliceRowIds('messagesBySession', sessionId)
      const requestIds = indexes.getSliceRowIds('requestsBySession', sessionId)

      transaction(() => {
        for (const mid of messageIds) {
          store.delRow('messages', mid)
        }
        for (const rid of requestIds) {
          store.delRow('requests', rid)
        }
        store.delRow('sessions', sessionId)
      })

      console.log('[runtime:deleteSession]', 'deleted', { sessionId })
    },

    sendMessage(args: SendMessageArgs) {
      const { sessionId, text } = args
      if (!store.hasRow('sessions', sessionId)) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      const session = decodeSession(sessionId, store.getRow('sessions', sessionId))

      // Only one inference turn can be active in a session.
      for (const requestId of indexes.getSliceRowIds('requestsBySession', sessionId)) {
        const status = store.getCell('requests', requestId, 'status')
        if (status === 'pending' || status === 'streaming') {
          console.log('[runtime:sendMessage]', 'skipped: active request exists', { sessionId })
          return null
        }
      }

      const messageId = generateId.message()
      const assistantMessageId = generateId.message()
      const requestId = generateId.request()
      const userSeq = session.lastSeq + 1
      const assistantSeq = session.lastSeq + 2
      const isFirstMessage = session.lastSeq === 0
      const title = isFirstMessage ? titleFromText(text) : session.title
      const timestamp = Date.now()

      // Create the transcript pair and request/run record atomically.
      transaction(() => {
        store.setRow('messages', messageId, {
          createdAt: timestamp,
          parts: [{ text, type: 'text' }],
          role: 'user',
          seq: userSeq,
          sessionId,
          updatedAt: timestamp,
        })
        store.setRow('messages', assistantMessageId, {
          createdAt: timestamp,
          parts: [],
          role: 'assistant',
          seq: assistantSeq,
          sessionId,
          updatedAt: timestamp,
        })
        store.setPartialRow('sessions', sessionId, {
          lastSeq: assistantSeq,
          title,
          updatedAt: Date.now(),
        })
        store.setRow('requests', requestId, {
          assistantMessageId,
          config: session.config,
          createdAt: Date.now(),
          errorMessage: '',
          messageId,
          sessionId,
          status: 'pending',
        })
      })

      // Start the provider stream outside the current mutation turn.
      store.setPartialRow('requests', requestId, { status: 'streaming' })
      queueMicrotask(() => {
        void executeRequest(context, { requestId, sessionId })
      })

      console.log('[runtime:sendMessage]', 'sent', {
        assistantMessageId,
        messageId,
        requestId,
        sessionId,
        userSeq,
      })
      return { assistantMessageId, messageId, requestId, seq: assistantSeq }
    },

    updateSession(args: UpdateSessionArgs) {
      const { sessionId, title } = args
      if (store.hasRow('sessions', sessionId)) {
        store.setPartialRow('sessions', sessionId, { title, updatedAt: Date.now() })
      }
      console.log('[runtime:updateSession]', 'updated', { sessionId, title })
    },

    updateSessionConfig(args: UpdateSessionConfigArgs) {
      const { patch, sessionId } = args
      if (!store.hasRow('sessions', sessionId)) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      const session = decodeSession(sessionId, store.getRow('sessions', sessionId))
      const nextConfig = { ...session.config, ...patch }
      store.setPartialRow('sessions', sessionId, { config: nextConfig, updatedAt: Date.now() })
      console.log('[runtime:updateSessionConfig]', 'updated', { sessionId })
    },
  }
}
