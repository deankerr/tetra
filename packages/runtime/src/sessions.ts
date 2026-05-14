import { DEFAULT_REQUEST_CONFIG, generateId, parseRequestConfig } from '@tetra/store'
import type { RequestConfig, TetraStore } from '@tetra/store'
import type { UIMessage } from 'ai'

export const createSessions = (context: {
  indexes: TetraStore['indexes']
  store: TetraStore['store']
}) => {
  const { indexes, store } = context

  // If the session has no title yet, derive one from the first text part and persist it.
  const maybeSetSessionTitle = (sessionId: string, parts: UIMessage['parts']) => {
    const session = store.getRow('sessions', sessionId)
    if (session.title !== '') {
      return
    }

    const firstText = parts.find((p) => p.type === 'text')?.text
    if (firstText === undefined) {
      return
    }

    const normalized = firstText.replaceAll(/\s+/gu, ' ').trim()
    const title = normalized.length <= 128 ? normalized : `${normalized.slice(0, 127)}…`
    store.setPartialRow('sessions', sessionId, { title, updatedAt: Date.now() })
  }

  const addMessage = (
    sessionId: string,
    args: {
      parts: UIMessage['parts']
      role: UIMessage['role']
    },
  ) => {
    const messageId = generateId.message()
    const timestamp = Date.now()

    maybeSetSessionTitle(sessionId, args.parts)

    store.setRow('messages', messageId, {
      createdAt: timestamp,
      parts: args.parts,
      role: args.role,
      sessionId,
      updatedAt: timestamp,
    })

    console.log('[runtime:sessions.messages.add]', 'added', {
      messageId,
      role: args.role,
      sessionId,
    })
    return { messageId }
  }

  const deleteMessage = (messageId: string) => {
    // Missing messages are already deleted from the caller's perspective.
    if (!store.hasRow('messages', messageId)) {
      return
    }

    store.delRow('messages', messageId)
    console.log('[runtime:sessions.messages.delete]', 'deleted', { messageId })
  }

  const deleteSession = (sessionId: string) => {
    // Remove child rows before the owning session row.
    const messageIds = indexes.getSliceRowIds('messagesBySession', sessionId)
    const requestIds = indexes.getSliceRowIds('requestsBySession', sessionId)

    store.transaction(() => {
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
    // Persist the edited config as the next request default.
    const session = store.getRow('sessions', sessionId)
    const nextConfig = { ...parseRequestConfig(session.config), ...args.patch }
    store.setPartialRow('sessions', sessionId, { config: nextConfig, updatedAt: Date.now() })
    console.log('[runtime:sessions.updateConfig]', 'updated', { sessionId })
  }

  return {
    addMessage,
    create(args: { title?: string } = {}) {
      // New sessions begin as empty transcripts with default inference config.
      const sessionId = generateId.session()
      const timestamp = Date.now()

      store.setRow('sessions', sessionId, {
        config: DEFAULT_REQUEST_CONFIG,
        createdAt: timestamp,
        title: args.title ?? '',
        updatedAt: timestamp,
      })

      console.log('[runtime:sessions.create]', 'created', { sessionId })
      return sessionId
    },
    deleteMessage,
    deleteSession,
    updateSession,
    updateSessionConfig,
  }
}
