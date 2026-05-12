import { createIndexes } from 'tinybase/indexes/with-schemas'
import type { Row, TablesSchema, ValuesSchema } from 'tinybase/with-schemas'
import { createStore } from 'tinybase/with-schemas'

export const tablesSchema = {
  messages: {
    createdAt: { default: 0, type: 'number' },
    parts: { default: [], type: 'array' },
    role: { default: 'user', type: 'string' },
    seq: { default: 0, type: 'number' },
    sessionId: { default: '', type: 'string' },
    updatedAt: { default: 0, type: 'number' },
  },
  requests: {
    assistantMessageId: { default: '', type: 'string' },
    config: { default: {}, type: 'object' },
    createdAt: { default: 0, type: 'number' },
    errorMessage: { default: '', type: 'string' },
    messageId: { default: '', type: 'string' },
    sessionId: { default: '', type: 'string' },
    status: { default: 'pending', type: 'string' },
  },
  sessions: {
    config: { default: {}, type: 'object' },
    createdAt: { default: 0, type: 'number' },
    lastSeq: { default: 0, type: 'number' },
    title: { default: '', type: 'string' },
    updatedAt: { default: 0, type: 'number' },
  },
} as const satisfies TablesSchema

export const valuesSchema = {} as const satisfies ValuesSchema

export type Schemas = [typeof tablesSchema, typeof valuesSchema]
export type MessageRow = Row<Schemas[0], 'messages'>
export type RequestRow = Row<Schemas[0], 'requests'>
export type SessionRow = Row<Schemas[0], 'sessions'>

export type TetraStore = ReturnType<typeof createTetraStore>

export function createTetraStore() {
  const store = createStore().setSchema(tablesSchema, valuesSchema)
  const indexes = createIndexes(store)
    .setIndexDefinition(
      'sessionsByRecency',
      'sessions',
      () => 'all',
      (_, rowId) => store.getCell('sessions', rowId, 'updatedAt'),
      undefined,
      (left, right) => Number(right) - Number(left),
    )
    .setIndexDefinition(
      'messagesBySession',
      'messages',
      'sessionId',
      'seq',
      undefined,
      (left, right) => Number(left) - Number(right),
    )
    .setIndexDefinition(
      'requestsBySession',
      'requests',
      'sessionId',
      'createdAt',
      undefined,
      (left, right) => Number(right) - Number(left),
    )
    .setIndexDefinition('requestByAssistantMessage', 'requests', 'assistantMessageId')

  return { indexes, store }
}
