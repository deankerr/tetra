import { expect, test } from 'bun:test'

import { z } from 'zod'

import { defineTypedTinybase, tinybaseCell, tinybaseIndex, tinybaseTable } from './index.ts'

const ModelConfig = z.object({
  maxMessages: z.number().int().positive().optional(),
  modelId: z.string(),
  providerOptions: z.record(z.string(), z.json()).default({}),
  systemPromptId: z.string().optional(),
  toolIds: z.array(z.string()).default([]),
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
        createdAt: tinybaseCell.number(z.number().default(0), { default: 0 }),
        parts: tinybaseCell.array(z.array(MessagePart).default([]), { default: [] }),
        role: tinybaseCell.string(z.enum(['assistant', 'user']).default('user'), {
          default: 'user',
        }),
        sessionId: tinybaseCell.string(z.string()),
        updatedAt: tinybaseCell.number(z.number().default(0), { default: 0 }),
      }),
      sessions: tinybaseTable({
        config: tinybaseCell.object(
          ModelConfig.default({
            modelId: 'anthropic/claude-sonnet-4.5',
            providerOptions: {},
            toolIds: [],
          }),
          {
            default: {
              modelId: 'anthropic/claude-sonnet-4.5',
              providerOptions: {},
              toolIds: [],
            },
          },
        ),
        createdAt: tinybaseCell.number(z.number().default(0), { default: 0 }),
        title: tinybaseCell.string(z.string().default(''), { default: '' }),
        updatedAt: tinybaseCell.number(z.number().default(0), { default: 0 }),
      }),
    },
    values: {
      activeSessionId: tinybaseCell.string(z.string().default(''), { default: '' }),
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

  db.sessions.setRow('sess_1', {
    config: { modelId: 'openai/gpt-5.1', providerOptions: { effort: 'low' } },
    title: 'Typed TinyBase',
  })
  db.messages.setRow('msg_1', {
    parts: [{ text: 'hello from a typed TinyBase row', type: 'text' }],
    role: 'user',
    sessionId: 'sess_1',
  })

  expect(db.sessions.getRow('sess_1')).toEqual({
    config: {
      modelId: 'openai/gpt-5.1',
      providerOptions: { effort: 'low' },
      toolIds: [],
    },
    createdAt: 0,
    title: 'Typed TinyBase',
    updatedAt: 0,
  })
  expect(db.sessions.getEntity('sess_1')?.id).toBe('sess_1')
  expect(db.sessions.getRowIds()).toEqual(['sess_1'])
  expect(db.messages.requireEntity('msg_1').parts[0]).toEqual({
    text: 'hello from a typed TinyBase row',
    type: 'text',
  })
  expect(db.sessions.hasRow('sess_1')).toBe(true)
  expect(db.sessions.getCell('sess_1', 'title')).toBe('Typed TinyBase')

  db.sessions.setCell('sess_1', 'title', 'Cell update')
  expect(db.sessions.requireEntity('sess_1').title).toBe('Cell update')
  db.sessions.updateRow('sess_1', { title: 'Updated title' })
  expect(db.sessions.requireEntity('sess_1').title).toBe('Updated title')

  expect(db.sessions.listEntities()).toHaveLength(1)
  db.messages.deleteRow('msg_1')
  expect(db.messages.getEntity('msg_1')).toBeNull()
})

test('binds typed value methods separately from table row methods', () => {
  const definition = createTestDefinition()
  const db = definition.bindTinybaseStore(definition.createTinybaseStore())

  expect(db.getValue('activeSessionId').getValue()).toBe('')

  db.getValue('activeSessionId').setValue('sess_1')
  expect(db.getValue('activeSessionId').getValue()).toBe('sess_1')

  db.getValue('activeSessionId').deleteValue()
  expect(db.getValue('activeSessionId').getValue()).toBe('')
})

test('creates and binds typed TinyBase indexes', () => {
  const definition = createTestDefinition()
  const store = definition.createTinybaseStore()
  const db = definition.bindTinybaseStore(store)
  const indexes = definition.bindTinybaseIndexes(definition.createTinybaseIndexes(store))

  db.sessions.setRow('sess_1', { title: 'Indexed' })
  db.messages.setRow('msg_1', {
    parts: [{ text: 'hello', type: 'text' }],
    sessionId: 'sess_1',
  })

  expect(indexes.getSliceRowIds('messagesBySession', 'sess_1')).toEqual(['msg_1'])
  expect(indexes.messagesBySession.getSliceRowIds('sess_1')).toEqual(['msg_1'])
})

test('parses raw rows, entities, values, and individual cell schemas through zod', () => {
  const definition = createTestDefinition()

  expect(definition.parseRow('sessions', { title: 'Defaults fill the rest' })).toEqual({
    config: {
      modelId: 'anthropic/claude-sonnet-4.5',
      providerOptions: {},
      toolIds: [],
    },
    createdAt: 0,
    title: 'Defaults fill the rest',
    updatedAt: 0,
  })
  expect(definition.parseEntity('sessions', 'sess_1', { title: 'Entity' })).toEqual({
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

  expect(() => db.sessions.requireEntity('missing_session')).toThrow(
    'Missing row: sessions/missing_session',
  )
  expect(() => db.sessions.updateRow('missing_session', { title: 'Nope' })).toThrow(
    'Missing row: sessions/missing_session',
  )

  const invalidMessageRow: unknown = {
    parts: [],
    role: 'system',
    sessionId: 'sess_1',
  }

  expect(() => definition.parseRow('messages', invalidMessageRow)).toThrow()
})
