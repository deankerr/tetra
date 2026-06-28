import { expect, test } from 'bun:test'

import { createIndexes } from 'tinybase/indexes/with-schemas'
import { createStore } from 'tinybase/store/with-schemas'
import { z } from 'zod'

import { defineStoreSchema } from '../index.ts'
import { bindIndexes } from './indexes.ts'
import { bindStore } from './store.ts'

const messagesSchema = defineStoreSchema({
  tables: {
    messages: z.object({
      createdAt: z.number().default(0),
      sessionId: z.string(),
    }),
  },
})

const messagesIndexIds = ['messagesBySession'] as const

test('creates and binds typed TinyBase indexes', () => {
  const store = createStore().setSchema(
    structuredClone(messagesSchema.tablesSchema),
    structuredClone(messagesSchema.valuesSchema),
  )
  const db = bindStore(store, messagesSchema.tables, messagesSchema.values)
  const rawIndexes = createIndexes(store)
  rawIndexes.setIndexDefinition('messagesBySession', 'messages', 'sessionId')
  const indexes = bindIndexes(rawIndexes, messagesIndexIds)

  db.tables.messages.setRow('msg_1', { createdAt: 0, sessionId: 'sess_1' })
  db.tables.messages.setRow('msg_2', { createdAt: 0, sessionId: 'sess_2' })

  expect(indexes.getSliceIds('messagesBySession')).toEqual(['sess_1', 'sess_2'])
  expect(indexes.getSliceRowIds('messagesBySession', 'sess_1')).toEqual(['msg_1'])
  expect(indexes.messagesBySession.getSliceRowIds('sess_1')).toEqual(['msg_1'])
})
