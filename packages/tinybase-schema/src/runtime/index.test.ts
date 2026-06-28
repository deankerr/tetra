import { describe, expect, test } from 'bun:test'

import { z } from 'zod'

import { defineStoreSchema } from '../index.ts'
import {
  createMergeableStoreInstance,
  createStoreInstance,
  defineStoreDefinition,
} from './index.ts'

const exampleStoreSchema = defineStoreSchema({
  tables: {
    messages: z.object({
      sessionId: z.string(),
      title: z.string().default(''),
    }),
  },
  values: {
    lastRefreshed: z.number().nullable().default(null),
  },
})

const exampleIndexIds = ['messagesBySession'] as const

const exampleStoreDefinition = defineStoreDefinition({
  applyIndexes(rawIndexes) {
    rawIndexes.setIndexDefinition('messagesBySession', 'messages', 'sessionId')
  },
  id: 'library',
  indexIds: exampleIndexIds,
  schema: exampleStoreSchema,
})

describe('typed store runtime instances', () => {
  test('creates a plain TinyBase store with typed store and index APIs', () => {
    const instance = createStoreInstance(exampleStoreDefinition)

    expect(instance.id).toBe('library')
    expect('getMergeableContent' in instance.rawStore).toBe(false)

    instance.boundStore.values.lastRefreshed.set(123)
    instance.boundStore.tables.messages.setRow('msg_1', {
      sessionId: 'sess_1',
      title: 'Runtime',
    })

    expect(instance.boundStore.values.lastRefreshed.get()).toBe(123)
    expect(instance.boundIndexes.getSliceRowIds('messagesBySession', 'sess_1')).toEqual(['msg_1'])
  })

  test('creates a mergeable TinyBase store with the same typed APIs', () => {
    const instance = createMergeableStoreInstance(exampleStoreDefinition)

    expect(instance.id).toBe('library')
    expect('getMergeableContent' in instance.rawStore).toBe(true)

    instance.boundStore.tables.messages.setRow('msg_1', {
      sessionId: 'sess_1',
      title: 'Mergeable runtime',
    })

    expect(instance.boundIndexes.messagesBySession.getSliceRowIds('sess_1')).toEqual(['msg_1'])
  })
})
