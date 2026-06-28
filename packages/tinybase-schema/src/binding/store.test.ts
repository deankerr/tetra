import { expect, test } from 'bun:test'

/* oxlint-disable import/no-duplicates -- tinybase's raw store and its with-schemas typed entry share one runtime module; both names are needed (schemaless raw store vs schema-aware store). */
import { createStore as createRawStore } from 'tinybase/store'
import { createStore } from 'tinybase/store/with-schemas'
import { z } from 'zod'

import { defineStoreSchema } from '../index.ts'
import { bindStore } from './store.ts'

const ModelConfig = z.object({
  maxMessages: z.number().int().positive().optional(),
  modelId: z.string(),
  providerOptions: z.record(z.string(), z.json()),
  systemPromptId: z.string().optional(),
  toolIds: z.array(z.string()),
})

const MessagePart = z.discriminatedUnion('type', [
  z.object({ text: z.string(), type: z.literal('text') }),
  z.object({ text: z.string(), type: z.literal('reasoning') }),
])

const createTestDefinition = () =>
  defineStoreSchema({
    tables: {
      messages: z.object({
        createdAt: z.number().default(0),
        parts: z.array(MessagePart).default([]),
        role: z.enum(['assistant', 'user']).default('user'),
        sessionId: z.string(),
        updatedAt: z.number().default(0),
      }),
      sessions: z.object({
        config: ModelConfig.default({
          modelId: 'anthropic/claude-sonnet-4.5',
          providerOptions: {},
          toolIds: [],
        }),
        createdAt: z.number().default(0),
        title: z.string().default(''),
        updatedAt: z.number().default(0),
      }),
    },
    values: {
      activeSessionId: z.string().default(''),
    },
  })

function createTestStore(definition: ReturnType<typeof createTestDefinition>) {
  // TinyBase runtime objects are owned by the caller; the definition only supplies schemas.
  const tablesSchema = structuredClone(definition.tablesSchema)
  const valuesSchema = structuredClone(definition.valuesSchema)

  return createStore().setSchema(tablesSchema, valuesSchema)
}

function bindTestStore(definition: ReturnType<typeof createTestDefinition>) {
  // Bind zod-backed helpers around an externally created TinyBase Store.
  return bindStore(createTestStore(definition), definition.tables, definition.values)
}

test('binds a TinyBase store with explicit typed row CRUD methods', () => {
  const definition = createTestDefinition()
  const db = bindTestStore(definition)

  db.tables.sessions.setRow('sess_1', {
    config: { modelId: 'openai/gpt-5.1', providerOptions: { effort: 'low' }, toolIds: [] },
    createdAt: 0,
    title: 'Typed TinyBase',
    updatedAt: 0,
  })
  db.tables.messages.setRow('msg_1', {
    createdAt: 0,
    parts: [{ text: 'hello from a typed TinyBase row', type: 'text' }],
    role: 'user',
    sessionId: 'sess_1',
    updatedAt: 0,
  })

  expect(db.tables.sessions.getRow('sess_1')).toEqual({
    config: { modelId: 'openai/gpt-5.1', providerOptions: { effort: 'low' }, toolIds: [] },
    createdAt: 0,
    title: 'Typed TinyBase',
    updatedAt: 0,
  })
  expect(db.tables.sessions.getEntity('sess_1')?.id).toBe('sess_1')
  expect(db.tables.sessions.getEntities(['sess_1', 'missing_session'])).toEqual([
    {
      config: { modelId: 'openai/gpt-5.1', providerOptions: { effort: 'low' }, toolIds: [] },
      createdAt: 0,
      id: 'sess_1',
      title: 'Typed TinyBase',
      updatedAt: 0,
    },
  ])
  expect(db.tables.sessions.getRowIds()).toEqual(['sess_1'])
  expect(db.tables.messages.requireEntity('msg_1').parts[0]).toEqual({
    text: 'hello from a typed TinyBase row',
    type: 'text',
  })
  expect(db.tables.sessions.hasRow('sess_1')).toBe(true)
  expect(db.tables.sessions.getCell('sess_1', 'title')).toBe('Typed TinyBase')

  db.tables.sessions.setCell('sess_1', 'title', 'Cell update')
  expect(db.tables.sessions.requireEntity('sess_1').title).toBe('Cell update')
  db.tables.sessions.updateRow('sess_1', { title: 'Updated title' })
  expect(db.tables.sessions.requireEntity('sess_1').title).toBe('Updated title')

  expect(db.tables.sessions.listEntities()).toHaveLength(1)
  db.tables.messages.deleteRow('msg_1')
  expect(db.tables.messages.getEntity('msg_1')).toBeNull()
})

test('keeps table query methods precise around missing rows and raw TinyBase defaults', () => {
  const definition = createTestDefinition()
  const store = createTestStore(definition)
  const db = bindStore(store, definition.tables, definition.values)

  store.setPartialRow('sessions', 'sess_1', { title: 'TinyBase default fill' })

  expect(db.tables.sessions.getRow('missing_session')).toBeNull()
  expect(db.tables.sessions.getEntity('missing_session')).toBeNull()
  expect(db.tables.sessions.getEntities(['missing_session'])).toEqual([])
  expect(db.tables.sessions.getCell('missing_session', 'title')).toBeUndefined()
  expect(db.tables.sessions.getRow('sess_1')).toEqual({
    config: { modelId: 'anthropic/claude-sonnet-4.5', providerOptions: {}, toolIds: [] },
    createdAt: 0,
    title: 'TinyBase default fill',
    updatedAt: 0,
  })
})

test('confirms raw TinyBase defaults repair invalid raw writes', () => {
  const store = createRawStore().setSchema(
    {
      examples: {
        count: { default: 1, type: 'number' },
        label: { type: 'string' },
        nullableCount: { allowNull: true, default: null, type: 'number' },
      },
    },
    {
      defaultedCount: { default: 2, type: 'number' },
      nullableCount: { allowNull: true, default: null, type: 'number' },
      requiredCount: { type: 'number' },
    },
  )

  // Raw TinyBase repairs invalid cells with defaults and omits invalid cells without defaults.
  store.setRow('examples', 'row_1', {
    count: 'not-a-number',
    label: 42,
    nullableCount: 'also-not-a-number',
  })
  expect(store.getRow('examples', 'row_1')).toEqual({
    count: 1,
    nullableCount: null,
  })

  // Raw TinyBase applies the same default-or-omit behavior to invalid values.
  store.setValue('defaultedCount', 'not-a-number')
  store.setValue('nullableCount', 'also-not-a-number')
  store.setValue('requiredCount', 'no-default')
  expect(store.getValues()).toEqual({
    defaultedCount: 2,
    nullableCount: null,
  })
  expect(store.hasValue('requiredCount')).toBe(false)
})

test('parses table mutation inputs before writing to TinyBase', () => {
  const definition = createTestDefinition()
  const db = bindTestStore(definition)
  const invalidSessionRow = {
    config: { modelId: 'anthropic/claude-sonnet-4.5', providerOptions: {}, toolIds: [] },
    createdAt: 0,
    title: 42,
    updatedAt: 0,
  }

  // @ts-expect-error - Zod validation rejects invalid rows before TinyBase can default them.
  expect(() => db.tables.sessions.setRow('sess_1', invalidSessionRow)).toThrow()
  expect(db.tables.sessions.hasRow('sess_1')).toBe(false)

  db.tables.sessions.setRow('sess_1', {
    config: { modelId: 'anthropic/claude-sonnet-4.5', providerOptions: {}, toolIds: [] },
    createdAt: 0,
    title: 'Valid',
    updatedAt: 0,
  })

  // @ts-expect-error - Zod validation rejects invalid cells before TinyBase can default them.
  expect(() => db.tables.sessions.setCell('sess_1', 'title', 42)).toThrow()
  expect(db.tables.sessions.getCell('sess_1', 'title')).toBe('Valid')
  expect(() =>
    db.tables.sessions.updateRow('sess_1', {
      config: { maxMessages: 0, modelId: 'invalid config', providerOptions: {}, toolIds: ['ok'] },
    }),
  ).toThrow()
  expect(db.tables.sessions.requireEntity('sess_1').config).toEqual({
    modelId: 'anthropic/claude-sonnet-4.5',
    providerOptions: {},
    toolIds: [],
  })
})

test('runs multiple typed mutations inside a caller-owned TinyBase transaction', () => {
  const definition = createTestDefinition()
  const store = createTestStore(definition)
  const db = bindStore(store, definition.tables, definition.values)

  db.transaction(() => {
    db.tables.sessions.setRow('sess_1', {
      config: { modelId: 'anthropic/claude-sonnet-4.5', providerOptions: {}, toolIds: [] },
      createdAt: 1,
      title: 'Transaction',
      updatedAt: 1,
    })
    db.values.activeSessionId.set('sess_1')
  })

  expect(db.tables.sessions.requireEntity('sess_1').title).toBe('Transaction')
  expect(db.values.activeSessionId.get()).toBe('sess_1')
})

test('binds typed value methods separately from table row methods', () => {
  const definition = createTestDefinition()
  const db = bindTestStore(definition)

  expect(db.values.activeSessionId.get()).toBe('')
  expect(db.values.get('activeSessionId').get()).toBe('')

  db.values.activeSessionId.set('sess_1')
  expect(db.values.activeSessionId.get()).toBe('sess_1')

  db.values.activeSessionId.delete()
  expect(db.values.activeSessionId.get()).toBe('')
})

test('binds nullable default values as explicit nulls', () => {
  const definition = defineStoreSchema({
    tables: {},
    values: {
      lastSeenAt: z.number().nullable().default(null),
    },
  })
  const store = createRawStore().setSchema(
    structuredClone(definition.tablesSchema),
    structuredClone(definition.valuesSchema),
  )
  const db = bindStore(store, definition.tables, definition.values)

  expect(db.values.lastSeenAt.get()).toBeNull()
  db.values.lastSeenAt.set(123)
  expect(db.values.lastSeenAt.get()).toBe(123)
  db.values.lastSeenAt.delete()
  expect(db.values.lastSeenAt.get()).toBeNull()
})

test('parses value mutation inputs before writing to TinyBase', () => {
  const definition = createTestDefinition()
  const db = bindTestStore(definition)

  // @ts-expect-error - Zod validation rejects invalid values before TinyBase can default them.
  expect(() => db.values.activeSessionId.set(42)).toThrow()
  expect(db.values.activeSessionId.get()).toBe('')

  db.values.get('activeSessionId').set('sess_1')
  expect(db.values.activeSessionId.get()).toBe('sess_1')
})

test('throws when required entities or updates target a missing row', () => {
  const db = bindTestStore(createTestDefinition())

  expect(() => db.tables.sessions.requireEntity('missing_session')).toThrow(
    'Missing row: sessions/missing_session',
  )
  expect(() => db.tables.sessions.updateRow('missing_session', { title: 'Nope' })).toThrow(
    'Missing row: sessions/missing_session',
  )
})
