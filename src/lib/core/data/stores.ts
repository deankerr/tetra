import { createIndexes } from 'tinybase/indexes/with-schemas'
import type { Indexes } from 'tinybase/indexes/with-schemas'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db/with-schemas'
import * as UiReact from 'tinybase/ui-react/with-schemas'
import { createStore } from 'tinybase/with-schemas'
import type { Store } from 'tinybase/with-schemas'

import type { Schemas } from '@/lib/core/data/schemas'
import { tablesSchema, valuesSchema } from '@/lib/core/data/schemas'

// Schema-aware TinyBase React hooks.
// oxlint-disable-next-line no-unsafe-type-assertion -- TinyBase WithSchemas pattern
export const uiStore = UiReact as unknown as UiReact.WithSchemas<Schemas>

const DB_NAME = 'tetra'

export type AppStore = Store<Schemas>
export type AppIndexes = Indexes<Schemas>

export const createAppStore = (): AppStore => createStore().setSchema(tablesSchema, valuesSchema)

export const createAppPersister = (store: AppStore) =>
  createIndexedDbPersister(store, DB_NAME, 1, console.error)

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
