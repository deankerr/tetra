import { convertToModelMessages } from 'ai'
import type { ModelMessage, UIMessage } from 'ai'

import { DEFAULT_MODEL_CONFIG, ModelConfig, generateId } from '#model'
import type { Message, MessageRole, Session } from '#model'
import type { TetraStore } from '#store'

export interface Sessions {
  // Session CRUD
  create(title?: string, config?: ModelConfig): string
  delete(sessionId: string): void
  get(sessionId: string): Session
  getConfig(sessionId: string): ModelConfig
  list(): Session[]
  rename(sessionId: string, title: string): void
  setConfig(sessionId: string, config: ModelConfig): void

  // Message API — runner always goes through here, never writes message rows directly
  addMessage(sessionId: string, msg: { content: string; role: MessageRole }): string
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
}

export function createSessions({ indexes, store }: TetraStore): Sessions {
  function readSession(sessionId: string): Session {
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
        // eslint-disable-next-line typescript/no-unsafe-type-assertion -- ModelConfig stored in TinyBase object cell; double-cast required to bridge domain type to AnyObject
        config: config as unknown as Record<string, unknown>,
        createdAt: now,
        title,
        updatedAt: now,
      })
      return sessionId
    },

    delete(sessionId) {
      store.delRow('sessions', sessionId)
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
      const raw = store.getCell('sessions', sessionId, 'config')
      const result = ModelConfig.safeParse(raw)
      return result.success ? result.data : DEFAULT_MODEL_CONFIG
    },

    getMessage(messageId) {
      return readMessage(messageId)
    },

    getMessages(sessionId) {
      const ids = indexes.getSliceRowIds('messagesBySession', sessionId)
      return ids.map(readMessage)
    },

    list() {
      return store.getRowIds('sessions').map(readSession)
    },

    rename(sessionId, title) {
      store.setCell('sessions', sessionId, 'title', title)
      store.setCell('sessions', sessionId, 'updatedAt', Date.now())
    },

    setConfig(sessionId, config) {
      store.setPartialRow('sessions', sessionId, {
        // eslint-disable-next-line typescript/no-unsafe-type-assertion -- ModelConfig stored in TinyBase object cell; double-cast required to bridge domain type to AnyObject
        config: config as unknown as Record<string, unknown>,
        updatedAt: Date.now(),
      })
    },
  }
}
