import { createIndexes } from 'tinybase/indexes/with-schemas'
import { createMergeableStore as createTinybaseMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createStore as createTinybaseStore } from 'tinybase/store/with-schemas'

import { tablesSchema, valuesSchema } from '#model'

// Regular store — best for local SQLite; cells stored as typed columns per table
export function createStore() {
  const store = createTinybaseStore().setSchema(tablesSchema, valuesSchema)
  const indexes = createIndexes(store)
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
  return { indexes, store }
}

// Mergeable store — for CRDT sync; adds HLC timestamps per cell
export function createMergeableStore() {
  const store = createTinybaseMergeableStore().setSchema(tablesSchema, valuesSchema)
  const indexes = createIndexes(store)
    .setIndexDefinition('messagesBySession', 'messages', 'sessionId')
    .setIndexDefinition('requestByAssistantMessage', 'requests', 'assistantMessageId')
    .setIndexDefinition(
      'requestsBySession',
      'requests',
      'sessionId',
      'createdAt',
      undefined,
      (a, b) => Number(b) - Number(a),
    )
    .setIndexDefinition('stepsByMessage', 'steps', 'messageId', 'stepNumber')
  return { indexes, store }
}

// Base type — both factories are structurally compatible (MergeableStore extends Store)
export type TetraStore = ReturnType<typeof createStore>
