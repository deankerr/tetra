import { createIndexes } from 'tinybase/indexes/with-schemas'
import type { Indexes } from 'tinybase/indexes/with-schemas'
import type { MergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createMergeableStore } from 'tinybase/mergeable-store/with-schemas'

import type { Schemas } from './schemas.ts'
import { tablesSchema, valuesSchema } from './schemas.ts'

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
