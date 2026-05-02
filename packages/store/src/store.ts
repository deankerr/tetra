import type { TablesSchema, ValuesSchema } from 'tinybase'
import { createIndexes } from 'tinybase/indexes/with-schemas'
import type { Indexes } from 'tinybase/indexes/with-schemas'
import type { MergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createMergeableStore } from 'tinybase/mergeable-store/with-schemas'

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
    targetExecutorId: { default: '', type: 'string' },
  },
  sessions: {
    createdAt: { default: 0, type: 'number' },
    lastSeq: { default: 0, type: 'number' },
    title: { default: '', type: 'string' },
    updatedAt: { default: 0, type: 'number' },
  },
} as const satisfies TablesSchema

export const valuesSchema = {} as const satisfies ValuesSchema

export type Schemas = [typeof tablesSchema, typeof valuesSchema]

export type AppStore = MergeableStore<Schemas>
export type AppIndexes = Indexes<Schemas>

export const createAppStore = (): AppStore =>
  createMergeableStore().setSchema(tablesSchema, valuesSchema)

export const createAppIndexes = (store: AppStore): AppIndexes =>
  createIndexes(store)
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
