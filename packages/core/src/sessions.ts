import { convertToModelMessages } from 'ai'
import type { ModelMessage, UIMessage } from 'ai'

import { DEFAULT_MODEL_CONFIG, ModelConfig, RequestStatus, generateId } from '#model'
import type { Message, MessageRole, Request, Session, StepRecord } from '#model'
import type { TetraStore } from '#store'

export interface SessionExport {
  exportedAt: string
  messages: Message[]
  requests: Request[]
  session: Session
}

export interface Sessions {
  // Session CRUD
  create(title?: string, config?: ModelConfig): string
  delete(sessionId: string): void
  exists(sessionId: string): boolean
  get(sessionId: string): Session
  getConfig(sessionId: string): ModelConfig
  list(): Session[]
  rename(sessionId: string, title: string): void
  setConfig(sessionId: string, config: ModelConfig): void

  // Message API — runner always goes through here, never writes message rows directly
  addMessage(sessionId: string, msg: { content: string; role: MessageRole }): string
  deleteMessage(messageId: string): void
  getMessage(messageId: string): Message
  getMessages(sessionId: string): Message[]

  // History reconstruction for inference input.
  // Reads stored UIMessage parts and converts via convertToModelMessages.
  // convertToModelMessages handles providerMetadata → providerOptions (reasoning_details).
  gatherModelMessages(
    sessionId: string,
    assistantMessageId: string,
    maxMessages?: number,
  ): Promise<ModelMessage[]>

  // Snapshot export — produces a portable JSON-serialisable record of the full session.
  exportSession(sessionId: string): SessionExport

  // Snapshot import — writes a full session export into the store.
  // Preserves original row IDs, so re-importing is idempotent.
  importSession(data: SessionExport): string
}

export function createSessions({ indexes, store }: TetraStore): Sessions {
  function readSession(sessionId: string): Session {
    if (!store.hasRow('sessions', sessionId)) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const row = store.getRow('sessions', sessionId)
    return {
      config: row.config,
      createdAt: row.createdAt,
      id: sessionId,
      title: row.title,
      updatedAt: row.updatedAt,
    }
  }

  function readMessage(messageId: string): Message {
    const row = store.getRow('messages', messageId)
    return {
      createdAt: row.createdAt,
      id: messageId,
      parts: [...row.parts],
      role: row.role === 'assistant' ? 'assistant' : 'user',
      sessionId: row.sessionId,
      updatedAt: row.updatedAt,
    }
  }

  return {
    addMessage(sessionId, { content, role }) {
      const messageId = generateId.message()
      const now = Date.now()
      // User messages get an initial text part; assistant placeholders start empty
      const parts: UIMessage['parts'] = role === 'user' ? [{ text: content, type: 'text' }] : []
      store.setRow('messages', messageId, {
        createdAt: now,
        parts,
        role,
        sessionId,
        updatedAt: now,
      })
      store.setCell('sessions', sessionId, 'updatedAt', now)
      return messageId
    },

    create(title = '', config = DEFAULT_MODEL_CONFIG) {
      const sessionId = generateId.session()
      const now = Date.now()
      store.setRow('sessions', sessionId, {
        config,
        createdAt: now,
        title,
        updatedAt: now,
      })
      return sessionId
    },

    delete(sessionId) {
      if (!store.hasRow('sessions', sessionId)) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      // Cascade-delete child rows so no orphaned messages or requests remain.
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
    },

    deleteMessage(messageId) {
      store.delRow('messages', messageId)
    },

    exists(sessionId) {
      return store.hasRow('sessions', sessionId)
    },

    exportSession(sessionId) {
      const messageIds = indexes.getSliceRowIds('messagesBySession', sessionId)
      const requestIds = indexes.getSliceRowIds('requestsBySession', sessionId)

      const messages = messageIds
        .filter((id) => store.hasRow('messages', id))
        .map((id) => readMessage(id))

      const requests = requestIds
        .filter((id) => store.hasRow('requests', id))
        .map((id) => {
          const row = store.getRow('requests', id)
          return {
            assistantMessageId: row.assistantMessageId,
            completedAt: row.completedAt,
            config: ModelConfig.parse(row.config),
            createdAt: row.createdAt,
            errorMessage: row.errorMessage,
            id,
            sessionId: row.sessionId,
            status: RequestStatus.parse(row.status),
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- steps stored as StepRecord[]
            steps: (row.steps as StepRecord[]) ?? [],
          }
        })

      return {
        exportedAt: new Date().toISOString(),
        messages,
        requests,
        session: readSession(sessionId),
      }
    },

    async gatherModelMessages(sessionId, assistantMessageId, maxMessages) {
      let messageIds = indexes
        .getSliceRowIds('messagesBySession', sessionId)
        // Exclude the assistant placeholder being written to in this request
        .filter((id) => id !== assistantMessageId)

      if (maxMessages !== undefined) {
        messageIds = messageIds.slice(-maxMessages)
      }

      // Build UIMessages from stored parts, then convert to ModelMessage[] for inference.
      // convertToModelMessages handles providerMetadata → providerOptions for reasoning_details.
      const uiMessages: UIMessage[] = messageIds.map((id) => {
        const row = store.getRow('messages', id)
        return {
          id,
          // eslint-disable-next-line typescript/no-unsafe-type-assertion -- parts stored verbatim as UIMessage['parts'] by readUIMessageStream
          parts: row.parts as UIMessage['parts'],
          role: row.role === 'assistant' ? 'assistant' : 'user',
        }
      })

      return await convertToModelMessages(uiMessages)
    },

    get(sessionId) {
      return readSession(sessionId)
    },

    getConfig(sessionId) {
      if (!store.hasRow('sessions', sessionId)) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      const raw = store.getCell('sessions', sessionId, 'config')
      const result = ModelConfig.safeParse(raw)
      return result.success ? result.data : DEFAULT_MODEL_CONFIG
    },

    getMessage(messageId) {
      return readMessage(messageId)
    },

    getMessages(sessionId) {
      if (!store.hasRow('sessions', sessionId)) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      const ids = indexes.getSliceRowIds('messagesBySession', sessionId)
      return ids.map(readMessage)
    },

    importSession({ messages, requests, session }) {
      const { id: sessionId, ...sessionRow } = session

      store.transaction(() => {
        store.setRow('sessions', sessionId, {
          config: sessionRow.config,
          createdAt: sessionRow.createdAt,
          title: sessionRow.title,
          updatedAt: sessionRow.updatedAt,
        })

        for (const message of messages) {
          const { id: messageId, ...msgRow } = message
          store.setRow('messages', messageId, {
            createdAt: msgRow.createdAt,
            parts: msgRow.parts,
            role: msgRow.role,
            sessionId: msgRow.sessionId,
            updatedAt: msgRow.updatedAt,
          })
        }

        for (const request of requests) {
          const { id: requestId, ...reqRow } = request
          store.setRow('requests', requestId, {
            assistantMessageId: reqRow.assistantMessageId,
            completedAt: reqRow.completedAt ?? 0,
            config: reqRow.config,
            createdAt: reqRow.createdAt,
            errorMessage: reqRow.errorMessage ?? '',
            sessionId: reqRow.sessionId,
            status: reqRow.status,
            steps: reqRow.steps ?? [],
          })
        }
      })

      return sessionId
    },

    list() {
      return store
        .getRowIds('sessions')
        .map(readSession)
        .toSorted((a, b) => a.createdAt - b.createdAt)
    },

    rename(sessionId, title) {
      if (!store.hasRow('sessions', sessionId)) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      store.setCell('sessions', sessionId, 'title', title)
      store.setCell('sessions', sessionId, 'updatedAt', Date.now())
    },

    setConfig(sessionId, config) {
      if (!store.hasRow('sessions', sessionId)) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      store.setPartialRow('sessions', sessionId, {
        config,
        updatedAt: Date.now(),
      })
    },
  }
}
