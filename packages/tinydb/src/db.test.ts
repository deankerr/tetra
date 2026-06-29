import { describe, expect, test } from 'bun:test'

import { z } from 'zod'

import { createDb, createMergeableDb } from './db.ts'
import type { DbFor, EntitiesFor } from './db.ts'
import { defineSchema } from './schema.ts'
import type { NewOf } from './types.ts'

// A library-like schema: enough tables/cells/indexes to exercise the type machinery.
const schema = defineSchema({
  indexes: {
    messages: { bySession: { on: 'sessionId', sort: 'createdAt' } },
    runs: {
      bySessionNewestFirst: { desc: true, on: 'sessionId', sort: 'createdAt' },
      byTargetMessageNewestFirst: { desc: true, on: 'targetMessageId', sort: 'createdAt' },
    },
  },
  tables: {
    messages: z.object({
      createdAt: z.number(),
      parentMessageId: z.string().nullable(),
      role: z.string(),
      sessionId: z.string(),
      updatedAt: z.number(),
    }),
    prompts: z.object({
      content: z.string(),
      createdAt: z.number(),
      label: z.string(),
    }),
    runs: z.object({
      createdAt: z.number(),
      sessionId: z.string(),
      status: z.enum(['active', 'completed']),
      targetMessageId: z.string(),
    }),
    sessions: z.object({
      config: z.object({ modelId: z.string().default('') }).default({ modelId: '' }),
      createdAt: z.number(),
      title: z.string(),
    }),
  },
  values: {
    defaultRunConfig: z.string().nullable().default(null),
  },
})

type LibraryDb = DbFor<typeof schema>
type LibraryEntities = EntitiesFor<typeof schema>

describe('createDb runtime', () => {
  test('create / get / require / has / ids / all', () => {
    const db = createDb(schema)

    db.sessions.create('s1', { createdAt: 1, title: 'first' })
    expect(db.sessions.has('s1')).toBe(true)
    expect(db.sessions.get('s1')).toEqual({
      config: { modelId: '' },
      createdAt: 1,
      id: 's1',
      title: 'first',
    })
    expect(db.sessions.require('s1').title).toBe('first')
    expect(db.sessions.get('missing')).toBeNull()
    expect(db.sessions.ids()).toEqual(['s1'])
    expect(db.sessions.all()).toHaveLength(1)
  })

  test('create rejects an existing id; set upserts', () => {
    const db = createDb(schema)

    db.prompts.create('p1', { content: 'a', createdAt: 1, label: 'A' })
    expect(() => {
      db.prompts.create('p1', { content: 'b', createdAt: 2, label: 'B' })
    }).toThrow(/already exists/u)

    db.prompts.set('p1', { content: 'b', createdAt: 2, label: 'B' })
    expect(db.prompts.require('p1').content).toBe('b')
  })

  test('update is a field-patch; require throws on missing', () => {
    const db = createDb(schema)

    db.prompts.create('p1', { content: 'a', createdAt: 1, label: 'A' })
    db.prompts.update('p1', { content: 'edited' })
    expect(db.prompts.require('p1')).toEqual({
      content: 'edited',
      createdAt: 1,
      id: 'p1',
      label: 'A',
    })

    expect(() => {
      db.prompts.update('missing', { content: 'x' })
    }).toThrow(/Missing row/u)

    // An unknown cell id (only reachable via untyped callers) fails loud, not with a TypeError.
    expect(() => {
      // @ts-expect-error unknown cell id bypassing types must still throw at runtime
      db.prompts.update('p1', { nope: 1 })
    }).toThrow(/Unknown cell: prompts\.nope/u)
  })

  test('queries return entities, sorted by the declared comparator', () => {
    const db = createDb(schema)

    db.messages.create('m1', {
      createdAt: 10,
      parentMessageId: null,
      role: 'user',
      sessionId: 's1',
      updatedAt: 10,
    })
    db.messages.create('m2', {
      createdAt: 20,
      parentMessageId: 'm1',
      role: 'assistant',
      sessionId: 's1',
      updatedAt: 20,
    })
    db.messages.create('m3', {
      createdAt: 5,
      parentMessageId: null,
      role: 'user',
      sessionId: 'other',
      updatedAt: 5,
    })

    // Ascending numeric sort, scoped to the slice.
    expect(db.messages.bySession('s1').map((m) => m.id)).toEqual(['m1', 'm2'])

    db.runs.create('r1', {
      createdAt: 100,
      sessionId: 's1',
      status: 'active',
      targetMessageId: 'm1',
    })
    db.runs.create('r2', {
      createdAt: 200,
      sessionId: 's1',
      status: 'completed',
      targetMessageId: 'm2',
    })

    // desc: true → newest first.
    expect(db.runs.bySessionNewestFirst('s1').map((r) => r.id)).toEqual(['r2', 'r1'])
  })

  test('values: get returns the default, set overwrites', () => {
    const db = createDb(schema)

    expect(db.values.defaultRunConfig.get()).toBeNull()
    db.values.defaultRunConfig.set('cfg')
    expect(db.values.defaultRunConfig.get()).toBe('cfg')
  })

  test('batch coalesces writes', () => {
    const db = createDb(schema)
    let events = 0
    db.raw.store.addTablesListener(() => {
      events += 1
    })

    db.batch(() => {
      db.sessions.create('s1', { createdAt: 1, title: 'a' })
      db.sessions.create('s2', { createdAt: 2, title: 'b' })
    })

    expect(events).toBe(1)
    expect(db.sessions.ids()).toEqual(['s1', 's2'])
  })

  test('batch nests (flat-merge): the inner batch emits no separate event', () => {
    const db = createDb(schema)
    let events = 0
    db.raw.store.addTablesListener(() => {
      events += 1
    })

    db.batch(() => {
      db.sessions.create('s1', { createdAt: 1, title: 'a' })
      db.batch(() => {
        db.sessions.create('s2', { createdAt: 2, title: 'b' })
      })
    })

    expect(events).toBe(1)
    expect(db.sessions.ids()).toEqual(['s1', 's2'])
  })

  test('reads fail loud: a row violating its schema throws on read', () => {
    const db = createDb(schema)

    db.runs.create('r1', {
      createdAt: 1,
      sessionId: 's1',
      status: 'active',
      targetMessageId: 'm1',
    })

    // Corrupt the row through the raw store: 'bogus' is a valid coarse TinyBase string,
    // but violates the `status` enum, so the zod parse on read must throw.
    db.raw.store.setCell('runs', 'r1', 'status', 'bogus')

    expect(() => db.runs.get('r1')).toThrow()
    // One bad row throws the whole list — fail-loud, all-or-nothing.
    expect(() => db.runs.all()).toThrow()
  })

  test('queries sort lexically when the sort cell is a string', () => {
    // No current real index uses a string sort cell; this pins the lexical comparator.
    const lexical = defineSchema({
      indexes: { items: { byGroupDesc: { desc: true, on: 'group', sort: 'name' } } },
      tables: { items: z.object({ group: z.string(), name: z.string() }) },
    })
    const db = createDb(lexical)

    db.items.create('a', { group: 'g', name: 'apple' })
    db.items.create('b', { group: 'g', name: 'cherry' })
    db.items.create('c', { group: 'g', name: 'banana' })

    expect(db.items.byGroupDesc('g').map((item) => item.name)).toEqual([
      'cherry',
      'banana',
      'apple',
    ])
  })

  test('createMergeableDb yields the same clean API over a mergeable store', () => {
    const db = createMergeableDb(schema)

    db.sessions.create('s1', { createdAt: 1, title: 'first' })
    expect(db.sessions.require('s1').title).toBe('first')
    // The raw store is mergeable (sync-capable), unlike createDb's plain store.
    expect(typeof db.raw.store.getMergeableContent).toBe('function')
  })
})

// --- Type-level pressure tests (validated by the type checker, not at runtime) ---

type HasKey<T, K extends string> = K extends keyof T ? true : false

// Entity reads carry id + parsed cells.
const _entity: LibraryEntities['runs'] = {
  createdAt: 0,
  id: 'r1',
  sessionId: 's',
  status: 'active',
  targetMessageId: 'm',
}
void _entity

// New<E> makes defaulted cells optional (sessions.config) but keeps the rest required.
const _newSession: NewOf<typeof schema.tables.sessions> = { createdAt: 1, title: 't' }
void _newSession

function typeAssertions(db: LibraryDb): void {
  // Query methods are inferred onto the owning collection, returning entities.
  const runs = db.runs.bySessionNewestFirst('s1')
  const _runId: string = runs[0].id
  void _runId

  // The `on` cell type drives the arg type.
  // @ts-expect-error sessionId is a string, not a number
  db.runs.bySessionNewestFirst(123)

  // Tables without declared indexes get no query methods (asserted at the type level so
  // there is no error-typed runtime call to lint around).
  const _promptsHaveNoQueries: HasKey<LibraryDb['prompts'], 'bySession'> = false
  void _promptsHaveNoQueries

  // Writes are not addressable by query, only by id.
  db.sessions.create('s1', { createdAt: 1, title: 't' })
  // @ts-expect-error title is required for a fresh row
  db.sessions.create('s2', { createdAt: 1 })
}
void typeAssertions
