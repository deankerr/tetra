import { DEFAULT_REQUEST_CONFIG, generateId, parseRequestConfig } from '@tetra/store'
import type { RequestConfig } from '@tetra/store'
import type { UIMessage } from 'ai'

import type { RuntimeContext } from './context.ts'
import type { createRequests } from './requests.ts'
import { titleFromText } from './title.ts'

type RequestsApi = ReturnType<typeof createRequests>

export const createSessions = (context: RuntimeContext, requests: RequestsApi) => {
  const { indexes, store, transaction } = context

  const createHandle = (sessionId: string) => ({
    delete() {
      deleteSession(sessionId)
    },

    execute(args: { assistantMessageId: string; messageId: string }) {
      return requests.execute({ ...args, sessionId })
    },

    id: sessionId,

    messages: {
      add(args: {
        createdAt?: number
        id?: string
        parts: UIMessage['parts']
        role: UIMessage['role']
      }) {
        return addMessage(sessionId, args)
      },

      delete(args: { messageId: string }) {
        deleteMessage(args.messageId)
      },
    },

    update(args: { title: string }) {
      updateSession(sessionId, args)
    },

    updateConfig(args: { patch: Partial<RequestConfig> }) {
      updateSessionConfig(sessionId, args)
    },
  })

  const addMessage = (
    sessionId: string,
    args: {
      createdAt?: number
      id?: string
      parts: UIMessage['parts']
      role: UIMessage['role']
    },
  ) => {
    // Message writes are only valid against an existing session.
    if (!store.hasRow('sessions', sessionId)) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Append the caller-provided UI message parts without creating a request.
    const session = store.getRow('sessions', sessionId)
    const messageId = args.id ?? generateId.message()
    const seq = session.lastSeq + 1
    const timestamp = args.createdAt ?? Date.now()
    const firstTextPart = args.parts.find((part) => part.type === 'text')
    const title =
      session.lastSeq === 0 && firstTextPart?.text !== undefined
        ? titleFromText(firstTextPart.text)
        : session.title

    transaction(() => {
      store.setRow('messages', messageId, {
        createdAt: timestamp,
        parts: args.parts,
        role: args.role,
        seq,
        sessionId,
        updatedAt: timestamp,
      })
      store.setPartialRow('sessions', sessionId, {
        lastSeq: seq,
        title,
        updatedAt: Date.now(),
      })
    })

    console.log('[runtime:sessions.messages.add]', 'added', {
      messageId,
      role: args.role,
      seq,
      sessionId,
    })
    return { messageId, seq }
  }

  const deleteMessage = (messageId: string) => {
    // Missing messages are already deleted from the caller's perspective.
    if (!store.hasRow('messages', messageId)) {
      return
    }

    // Delete a request-linked message with its paired transcript row.
    const message = store.getRow('messages', messageId)
    const requestIds = indexes.getSliceRowIds('requestsBySession', message.sessionId)

    transaction(() => {
      for (const requestId of requestIds) {
        if (!store.hasRow('requests', requestId)) {
          continue
        }

        const request = store.getRow('requests', requestId)
        if (request.assistantMessageId === messageId || request.messageId === messageId) {
          store.delRow('requests', requestId)
          if (request.assistantMessageId !== messageId) {
            store.delRow('messages', request.assistantMessageId)
          }
          if (request.messageId !== messageId) {
            store.delRow('messages', request.messageId)
          }
          break
        }
      }
      store.delRow('messages', messageId)
    })

    console.log('[runtime:sessions.messages.delete]', 'deleted', { messageId })
  }

  const deleteSession = (sessionId: string) => {
    // Session deletion is a hard cascade over local transcript/runtime rows.
    if (!store.hasRow('sessions', sessionId)) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Remove child rows before the owning session row.
    const messageIds = indexes.getSliceRowIds('messagesBySession', sessionId)
    const requestIds = indexes.getSliceRowIds('requestsBySession', sessionId)

    transaction(() => {
      for (const messageId of messageIds) {
        store.delRow('messages', messageId)
      }
      for (const requestId of requestIds) {
        store.delRow('requests', requestId)
      }
      store.delRow('sessions', sessionId)
    })

    console.log('[runtime:sessions.delete]', 'deleted', { sessionId })
  }

  const updateSession = (sessionId: string, args: { title: string }) => {
    // Renames are ignored after deletion because the target no longer exists.
    if (store.hasRow('sessions', sessionId)) {
      store.setPartialRow('sessions', sessionId, { title: args.title, updatedAt: Date.now() })
    }
    console.log('[runtime:sessions.update]', 'updated', { sessionId, title: args.title })
  }

  const updateSessionConfig = (sessionId: string, args: { patch: Partial<RequestConfig> }) => {
    // Config patches are parsed before merging so bad stored config fails here.
    if (!store.hasRow('sessions', sessionId)) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Persist the edited config as the next request default.
    const session = store.getRow('sessions', sessionId)
    const nextConfig = { ...parseRequestConfig(session.config), ...args.patch }
    store.setPartialRow('sessions', sessionId, { config: nextConfig, updatedAt: Date.now() })
    console.log('[runtime:sessions.updateConfig]', 'updated', { sessionId })
  }

  return {
    create(args: { title?: string } = {}) {
      // New sessions begin as empty transcripts with default inference config.
      const sessionId = generateId.session()
      const timestamp = Date.now()

      store.setRow('sessions', sessionId, {
        config: DEFAULT_REQUEST_CONFIG,
        createdAt: timestamp,
        lastSeq: 0,
        title: args.title ?? '',
        updatedAt: timestamp,
      })

      console.log('[runtime:sessions.create]', 'created', { sessionId })
      return createHandle(sessionId)
    },

    get(sessionId: string) {
      // Session handles are lightweight facades over current store state.
      if (!store.hasRow('sessions', sessionId)) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      return createHandle(sessionId)
    },
  }
}
