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
  // Updates the rendering cache at step boundaries (never called per-token)
  setMessageParts(messageId: string, parts: UIMessage['parts']): void

  // History reconstruction for inference input.
  // Assistant turns are read from steps.responseMessages (not message parts),
  // preserving reasoning_details / providerOptions for multi-turn correctness.
  gatherModelMessages(
    sessionId: string,
    assistantMessageId: string,
    maxMessages?: number,
  ): ModelMessage[]
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
      store.setRow('messages', messageId, {
        createdAt: now,
        parts: [{ text: content, type: 'text' }],
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

    gatherModelMessages(sessionId, assistantMessageId, maxMessages) {
      let messageIds = indexes
        .getSliceRowIds('messagesBySession', sessionId)
        // Exclude the assistant placeholder being written to in this request
        .filter((id) => id !== assistantMessageId)

      if (maxMessages !== undefined) {
        messageIds = messageIds.slice(-maxMessages)
      }

      const messages: ModelMessage[] = []

      for (const id of messageIds) {
        const row = store.getRow('messages', id)

        if (row.role === 'user') {
          // UIMessage text parts match UserModelMessage content structure directly
          // eslint-disable-next-line typescript/no-unsafe-type-assertion -- bridging UIMessage parts to ModelMessage; structurally compatible for text parts
          messages.push({ content: row.parts, role: 'user' } as unknown as ModelMessage)
          continue
        }

        // Collect ResponseMessage[] from each step in order — already in ModelMessage format
        const stepIds = indexes.getSliceRowIds('stepsByMessage', id)
        for (const stepId of stepIds) {
          const step = store.getRow('steps', stepId)
          // eslint-disable-next-line typescript/no-unsafe-type-assertion -- step.responseMessages is ResponseMessage[] stored verbatim from AI SDK
          messages.push(...(step.responseMessages as ModelMessage[]))
        }
      }

      return messages
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

    setMessageParts(messageId, parts) {
      store.setPartialRow('messages', messageId, { parts, updatedAt: Date.now() })
    },
  }
}
