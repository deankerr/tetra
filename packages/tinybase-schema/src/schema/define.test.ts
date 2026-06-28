import { expect, test } from 'bun:test'

import { z } from 'zod'

import { defineStoreSchema } from '../index.ts'

const ModelConfig = z.object({
  maxMessages: z.number().int().positive().optional(),
  modelId: z.string(),
  providerOptions: z.record(z.string(), z.json()),
  systemPromptId: z.string().optional(),
  toolIds: z.array(z.string()),
})

const schema = defineStoreSchema({
  tables: {
    messages: z.object({
      createdAt: z.number().default(0),
      parts: z.array(z.string()).default([]),
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

test('parses raw rows, entities, values, and individual cell schemas through zod', () => {
  expect(
    schema.parseRow('sessions', {
      config: { modelId: 'anthropic/claude-sonnet-4.5', providerOptions: {}, toolIds: [] },
      createdAt: 0,
      title: 'Complete row',
      updatedAt: 0,
    }),
  ).toEqual({
    config: { modelId: 'anthropic/claude-sonnet-4.5', providerOptions: {}, toolIds: [] },
    createdAt: 0,
    title: 'Complete row',
    updatedAt: 0,
  })

  expect(
    schema.parseEntity('sessions', 'sess_1', {
      config: { modelId: 'anthropic/claude-sonnet-4.5', providerOptions: {}, toolIds: [] },
      createdAt: 0,
      title: 'Entity',
      updatedAt: 0,
    }),
  ).toEqual({
    config: { modelId: 'anthropic/claude-sonnet-4.5', providerOptions: {}, toolIds: [] },
    createdAt: 0,
    id: 'sess_1',
    title: 'Entity',
    updatedAt: 0,
  })

  expect(schema.parseValue('activeSessionId', 'sess_1')).toBe('sess_1')
  expect(schema.getCellSchema('messages', 'role').parse('assistant')).toBe('assistant')
  expect(() => schema.getCellSchema('messages', 'role').parse('system')).toThrow()
})

test('throws when parsing rows that violate the schema', () => {
  // sessionId is required and has no default.
  expect(() => schema.parseRow('messages', { role: 'user' })).toThrow()

  const invalidMessageRow: unknown = {
    parts: [],
    role: 'system',
    sessionId: 'sess_1',
  }
  expect(() => schema.parseRow('messages', invalidMessageRow)).toThrow()
})
