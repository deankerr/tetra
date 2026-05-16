import { createIndexes } from 'tinybase/indexes/with-schemas'
import { createMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import type { MergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createStore as createTinybaseStore } from 'tinybase/store/with-schemas'
import type { Store } from 'tinybase/store/with-schemas'

import { tablesSchema, valuesSchema } from '#model'

type TetraSchemas = [typeof tablesSchema, typeof valuesSchema]
type TetraNormalStore = Store<TetraSchemas>
type TetraMergableStore = MergeableStore<TetraSchemas>

function addIndexes(s: TetraNormalStore | TetraMergableStore) {
  return (
    createIndexes(s)
      // HLC row IDs are lexicographically sortable, giving creation-time order for free
      .setIndexDefinition('messagesBySession', 'messages', 'sessionId')
      .setIndexDefinition('requestByAssistantMessage', 'requests', 'assistantMessageId')
      // Descending by createdAt — most recent request first
      .setIndexDefinition(
        'requestsBySession',
        'requests',
        'sessionId',
        'createdAt',
        undefined,
        (a, b) => Number(b) - Number(a),
      )
      .setIndexDefinition('stepsByMessage', 'steps', 'messageId', 'stepNumber')
  )
}

export function createTetraStore() {
  const store = createTinybaseStore().setSchema(tablesSchema, valuesSchema)
  return {
    indexes: addIndexes(store),
    store,
  }
}

export function createTetraMergeableStore() {
  const store = createMergeableStore().setSchema(tablesSchema, valuesSchema)
  return {
    indexes: addIndexes(store),
    store,
  }
}

// Base type — both factories are structurally compatible (MergeableStore extends Store)
export type TetraStore = ReturnType<typeof createTetraStore>
