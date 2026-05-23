import { expect, test } from 'bun:test'

import { z } from 'zod'

import { defineTypedTinybase, tinybaseCell, tinybaseIndex, tinybaseTable } from './index.ts'

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
  defineTypedTinybase({
    indexes: {
      messagesBySession: tinybaseIndex('messages', 'sessionId'),
    },
    tables: {
      messages: tinybaseTable({
        createdAt: tinybaseCell.number(z.number(), { default: 0 }),
        parts: tinybaseCell.array(z.array(MessagePart), { default: [] }),
        role: tinybaseCell.string(z.enum(['assistant', 'user']), {
          default: 'user',
        }),
        sessionId: tinybaseCell.string(z.string()),
        updatedAt: tinybaseCell.number(z.number(), { default: 0 }),
      }),
      sessions: tinybaseTable({
        config: tinybaseCell.object(ModelConfig, {
          default: {
            modelId: 'anthropic/claude-sonnet-4.5',
            providerOptions: {},
            toolIds: [],
          },
        }),
        createdAt: tinybaseCell.number(z.number(), { default: 0 }),
        title: tinybaseCell.string(z.string(), { default: '' }),
        updatedAt: tinybaseCell.number(z.number(), { default: 0 }),
      }),
    },
    values: {
      activeSessionId: tinybaseCell.string(z.string(), { default: '' }),
    },
  })

test('generates TinyBase schemas from explicit table and cell definitions', () => {
  const definition = createTestDefinition()

  expect(definition.tinybaseTablesSchema.messages).toEqual({
    createdAt: { default: 0, type: 'number' },
    parts: { default: [], type: 'array' },
    role: { default: 'user', type: 'string' },
    sessionId: { type: 'string' },
    updatedAt: { default: 0, type: 'number' },
  })
  expect(definition.tinybaseValuesSchema).toEqual({
    activeSessionId: { default: '', type: 'string' },
  })
})

test('binds a TinyBase store with explicit typed row CRUD methods', () => {
  const definition = createTestDefinition()
  const db = definition.bindTinybaseStore(definition.createTinybaseStore())

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
    config: {
      modelId: 'openai/gpt-5.1',
      providerOptions: { effort: 'low' },
      toolIds: [],
    },
    createdAt: 0,
    title: 'Typed TinyBase',
    updatedAt: 0,
  })
  expect(db.tables.sessions.getEntity('sess_1')?.id).toBe('sess_1')
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

test('binds typed value methods separately from table row methods', () => {
  const definition = createTestDefinition()
  const db = definition.bindTinybaseStore(definition.createTinybaseStore())

  expect(db.values.activeSessionId.get()).toBe('')
  expect(db.values.get('activeSessionId').get()).toBe('')

  db.values.activeSessionId.set('sess_1')
  expect(db.values.activeSessionId.get()).toBe('sess_1')

  db.values.activeSessionId.delete()
  expect(db.values.activeSessionId.get()).toBe('')
})

test('creates and binds typed TinyBase indexes', () => {
  const definition = createTestDefinition()
  const store = definition.createTinybaseStore()
  const db = definition.bindTinybaseStore(store)
  const indexes = definition.bindTinybaseIndexes(definition.createTinybaseIndexes(store))

  db.tables.sessions.setRow('sess_1', {
    config: {
      modelId: 'anthropic/claude-sonnet-4.5',
      providerOptions: {},
      toolIds: [],
    },
    createdAt: 0,
    title: 'Indexed',
    updatedAt: 0,
  })
  db.tables.messages.setRow('msg_1', {
    createdAt: 0,
    parts: [{ text: 'hello', type: 'text' }],
    role: 'user',
    sessionId: 'sess_1',
    updatedAt: 0,
  })

  expect(indexes.getSliceRowIds('messagesBySession', 'sess_1')).toEqual(['msg_1'])
  expect(indexes.messagesBySession.getSliceRowIds('sess_1')).toEqual(['msg_1'])
})

test('parses raw rows, entities, values, and individual cell schemas through zod', () => {
  const definition = createTestDefinition()

  expect(
    definition.parseRow('sessions', {
      config: {
        modelId: 'anthropic/claude-sonnet-4.5',
        providerOptions: {},
        toolIds: [],
      },
      createdAt: 0,
      title: 'Complete row',
      updatedAt: 0,
    }),
  ).toEqual({
    config: {
      modelId: 'anthropic/claude-sonnet-4.5',
      providerOptions: {},
      toolIds: [],
    },
    createdAt: 0,
    title: 'Complete row',
    updatedAt: 0,
  })
  expect(
    definition.parseEntity('sessions', 'sess_1', {
      config: {
        modelId: 'anthropic/claude-sonnet-4.5',
        providerOptions: {},
        toolIds: [],
      },
      createdAt: 0,
      title: 'Entity',
      updatedAt: 0,
    }),
  ).toEqual({
    config: {
      modelId: 'anthropic/claude-sonnet-4.5',
      providerOptions: {},
      toolIds: [],
    },
    createdAt: 0,
    id: 'sess_1',
    title: 'Entity',
    updatedAt: 0,
  })
  expect(definition.parseValue('activeSessionId', 'sess_1')).toBe('sess_1')
  expect(definition.getCellSchema('messages', 'role').parse('assistant')).toBe('assistant')
  expect(() => definition.getCellSchema('messages', 'role').parse('system')).toThrow()
})

test('throws loudly when required entities or invalid rows cross the boundary', () => {
  const definition = createTestDefinition()
  const db = definition.bindTinybaseStore(definition.createTinybaseStore())

  expect(() => db.tables.sessions.requireEntity('missing_session')).toThrow(
    'Missing row: sessions/missing_session',
  )
  expect(() => db.tables.sessions.updateRow('missing_session', { title: 'Nope' })).toThrow(
    'Missing row: sessions/missing_session',
  )
  expect(() => definition.parseRow('sessions', { title: 'No implicit defaults' })).toThrow()

  const invalidMessageRow: unknown = {
    parts: [],
    role: 'system',
    sessionId: 'sess_1',
  }

  expect(() => definition.parseRow('messages', invalidMessageRow)).toThrow()
})
