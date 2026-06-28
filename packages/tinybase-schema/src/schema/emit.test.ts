import { expect, test } from 'bun:test'

import { z } from 'zod'

import { defineStoreSchema } from '../index.ts'

test('generates TinyBase schemas from zod table and value definitions', () => {
  const schema = defineStoreSchema({
    tables: {
      messages: z.object({
        createdAt: z.number().default(0),
        parts: z.array(z.string()).default([]),
        role: z.enum(['assistant', 'user']).default('user'),
        sessionId: z.string(),
        updatedAt: z.number().default(0),
      }),
    },
    values: {
      activeSessionId: z.string().default(''),
    },
  })

  expect(schema.tablesSchema.messages).toEqual({
    createdAt: { default: 0, type: 'number' },
    parts: { default: [], type: 'array' },
    role: { default: 'user', type: 'string' },
    sessionId: { type: 'string' },
    updatedAt: { default: 0, type: 'number' },
  })
  expect(schema.valuesSchema).toEqual({
    activeSessionId: { default: '', type: 'string' },
  })
})

test('derives nullable, record, array, enum, and default cell schemas from zod', () => {
  const schema = defineStoreSchema({
    tables: {
      examples: z.object({
        count: z.number().default(1),
        enabled: z.boolean(),
        lastSeenAt: z.number().nullable().default(null),
        metadata: z.record(z.string(), z.json()),
        mode: z.enum(['draft', 'final']),
        name: z.string().nullable(),
        nullableMetadata: z.record(z.string(), z.json()).nullable().default(null),
        tags: z.array(z.string()),
      }),
    },
    values: {
      lastSyncedAt: z.number().nullable().default(null),
    },
  })

  expect(schema.tablesSchema.examples).toEqual({
    count: { default: 1, type: 'number' },
    enabled: { type: 'boolean' },
    lastSeenAt: { allowNull: true, default: null, type: 'number' },
    metadata: { type: 'object' },
    mode: { type: 'string' },
    name: { allowNull: true, type: 'string' },
    nullableMetadata: { allowNull: true, default: null, type: 'object' },
    tags: { type: 'array' },
  })
  expect(schema.valuesSchema as unknown).toEqual({
    lastSyncedAt: { allowNull: true, default: null, type: 'number' },
  })
})

test('rejects optional table and value cells in favor of explicit nullable cells', () => {
  expect(() =>
    defineStoreSchema({
      tables: { examples: z.object({ name: z.string().optional() }) },
    }),
  ).toThrow('Optional TinyBase cells are not supported for examples.name; use nullable() instead')

  expect(() =>
    defineStoreSchema({
      tables: { examples: z.object({ name: z.string().nullish() }) },
    }),
  ).toThrow('Optional TinyBase cells are not supported for examples.name; use nullable() instead')

  expect(() =>
    defineStoreSchema({
      tables: {},
      values: { activeId: z.string().optional() },
    }),
  ).toThrow('Optional TinyBase cells are not supported for activeId; use nullable() instead')
})

test('allows optional fields inside object cells', () => {
  const schema = defineStoreSchema({
    tables: {
      examples: z.object({
        config: z.object({
          maxMessages: z.number().optional(),
          modelId: z.string(),
        }),
      }),
    },
  })

  expect(schema.tablesSchema.examples).toEqual({
    config: { type: 'object' },
  })
})

test('throws when a zod schema cannot be represented as a TinyBase cell', () => {
  expect(() =>
    defineStoreSchema({
      tables: { examples: z.object({ opaque: z.custom(() => true) }) },
    }),
  ).toThrow('Cannot convert examples.opaque to a TinyBase cell schema')
})
