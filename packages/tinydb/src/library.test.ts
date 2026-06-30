import { describe, expect, test } from 'bun:test'

import { librarySchema } from '@tetra/schemas/library'

import { createDb } from './db.ts'
import type { DbFor } from './db.ts'

// The REAL library schema (custom UIMessage parts, z.record/z.json snapshots, nested-optional
// step usage, nullable-default value, object-default session config, the six indexes).
const schema = librarySchema

type LibraryDb = DbFor<typeof schema>

describe('real library schema', () => {
  test('createDb builds without choking on the real cell types', () => {
    expect(() => createDb(schema)).not.toThrow()
  })

  test('messages: custom UIMessage parts round-trip; defaulted config fills in', () => {
    const db = createDb(schema)

    db.sessions.create('s1', { createdAt: 1, title: 'chat', updatedAt: 1 })
    // sessions.config carries an object default — omitted at create, present on read.
    expect(db.sessions.require('s1').config).toEqual({
      maxMessages: 0,
      modelId: '',
      providerOptions: {},
      systemPromptId: '',
      toolIds: [],
    })

    db.messages.create('m1', {
      createdAt: 10,
      parentMessageId: null,
      parts: [{ text: 'hello', type: 'text' }],
      role: 'user',
      sessionId: 's1',
      updatedAt: 10,
    })
    const message = db.messages.require('m1')
    expect(message.parts).toEqual([{ text: 'hello', type: 'text' }])
    expect(message.parentMessageId).toBeNull()
  })

  test('runs: z.record/z.json config snapshot round-trips; desc query', () => {
    const db = createDb(schema)

    db.runs.create('r1', {
      config: { maxMessages: 5, modelId: 'x' },
      createdAt: 100,
      errorMessage: '',
      sessionId: 's1',
      status: 'active',
      targetMessageId: 'm1',
      terminalAt: 0,
      updatedAt: 100,
    })
    db.runs.create('r2', {
      config: {},
      createdAt: 200,
      errorMessage: '',
      sessionId: 's1',
      status: 'completed',
      targetMessageId: 'm2',
      terminalAt: 0,
      updatedAt: 200,
    })

    expect(db.runs.require('r1').config).toEqual({ maxMessages: 5, modelId: 'x' })
    expect(db.runs.bySessionNewestFirst('s1').map((run) => run.id)).toEqual(['r2', 'r1'])
  })

  test('steps: nested-optional usage round-trips; byRun sorts by stepNumber', () => {
    const db = createDb(schema)

    const baseStep = {
      cost: {},
      createdAt: 1,
      finishReason: 'stop',
      generationId: 'g',
      messageId: 'm1',
      model: 'x',
      provider: 'openrouter',
      raw: {},
      runId: 'r1',
      sessionId: 's1',
      usage: { input: { total: 10 }, output: { total: 20 } },
      warnings: [],
    }
    db.steps.create('st2', { ...baseStep, stepNumber: 2 })
    db.steps.create('st1', { ...baseStep, stepNumber: 1 })

    expect(db.steps.byRun('r1').map((step) => step.id)).toEqual(['st1', 'st2'])
    expect(db.steps.require('st1').usage).toEqual({ input: { total: 10 }, output: { total: 20 } })
  })

  test('value: nullable-default snapshot', () => {
    const db = createDb(schema)

    expect(db.values.defaultRunConfig.get()).toBeNull()
    db.values.defaultRunConfig.set({ modelId: 'y' })
    expect(db.values.defaultRunConfig.get()).toEqual({ modelId: 'y' })
  })

  test('index-less table (modelFavorites) works as a plain collection', () => {
    const db = createDb(schema)

    db.modelFavorites.create('openai/gpt', { createdAt: 1 })
    expect(db.modelFavorites.ids()).toEqual(['openai/gpt'])
  })

  test('shared index method name across tables does not collide (global index ids)', () => {
    // messages.bySession and steps.bySession both exist; each must query its own table.
    const db = createDb(schema)

    db.messages.create('m1', {
      createdAt: 1,
      parentMessageId: null,
      parts: [],
      role: 'user',
      sessionId: 's1',
      updatedAt: 1,
    })

    expect(db.messages.bySession('s1').map((message) => message.id)).toEqual(['m1'])
    expect(db.steps.bySession('s1')).toEqual([])
  })
})

// Type-level: inferred query methods reach across the real schema.
type HasKey<T, K extends string> = K extends keyof T ? true : false

function typeAssertions(db: LibraryDb): void {
  const [step] = db.steps.byRun('r1')
  if (step === undefined) {
    throw new Error('Expected at least one step for type assertion')
  }

  const _id: string = step.id
  void _id
  // modelFavorites declares no indexes → no query methods (type-level, no error-typed call).
  const _noQuery: HasKey<LibraryDb['modelFavorites'], 'bySession'> = false
  void _noQuery
}
void typeAssertions
