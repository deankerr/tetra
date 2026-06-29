import { beforeEach, expect, mock, test } from 'bun:test'

import { z } from 'zod'

import type { DbFor } from './db.ts'
import { defineSchema } from './schema.ts'

// Canned TinyBase hook state, swapped per test. Lets us exercise the wrapper's parsing and
// argument forwarding without rendering React.
interface HookState {
  cell: unknown
  hasRow: boolean
  row: Record<string, unknown>
  rowIds: string[]
  setCell: ReturnType<typeof mock>
  setValue: ReturnType<typeof mock>
  sliceRowIds: string[]
  table: Record<string, Record<string, unknown>>
  value: unknown
}

const hookState: HookState = {
  cell: undefined,
  hasRow: false,
  row: {},
  rowIds: [],
  setCell: mock(),
  setValue: mock(),
  sliceRowIds: [],
  table: {},
  value: undefined,
}

await mock.module('react', () => ({
  useCallback: <Fn extends (...args: never[]) => unknown>(fn: Fn) => fn,
  useMemo: <Value>(factory: () => Value) => factory(),
}))

const tinybaseHooks = {
  useCellState: mock(() => [hookState.cell, hookState.setCell]),
  useHasRow: mock(() => hookState.hasRow),
  useRow: mock(() => hookState.row),
  useRowIds: mock(() => hookState.rowIds),
  useSliceRowIds: mock(() => hookState.sliceRowIds),
  useTable: mock(() => hookState.table),
  useValue: mock(() => hookState.value),
  useValueState: mock(() => [hookState.value, hookState.setValue]),
}

await mock.module('tinybase/ui-react/with-schemas', () => tinybaseHooks)

const { createDbReactApi } = await import('./react.ts')

const schema = defineSchema({
  indexes: { messages: { bySession: { on: 'sessionId', sort: 'createdAt' } } },
  tables: {
    messages: z.object({
      count: z.coerce.number().default(0),
      createdAt: z.number(),
      sessionId: z.string(),
      title: z.string().trim(),
    }),
  },
  values: { activeId: z.string().trim().default('') },
})

// createDbReactApi only reads db.raw.{store,indexes}; sentinels prove they are forwarded.
// oxlint-disable-next-line no-unsafe-type-assertion -- test sentinel; only raw.{store,indexes} is read
const fakeDb = { raw: { indexes: 'INDEXES', store: 'STORE' } } as unknown as DbFor<typeof schema>
const createApi = () => createDbReactApi(schema, fakeDb)

beforeEach(() => {
  hookState.cell = undefined
  hookState.hasRow = false
  hookState.row = {}
  hookState.rowIds = []
  hookState.setCell = mock()
  hookState.setValue = mock()
  hookState.sliceRowIds = []
  hookState.table = {}
  hookState.value = undefined
  for (const hook of Object.values(tinybaseHooks)) {
    hook.mockClear()
  }
})

test('reads parse coarse cells into entities', () => {
  const r = createApi()

  hookState.hasRow = true
  hookState.row = { count: '3', createdAt: 1, sessionId: 's', title: '  Hello  ' }
  hookState.rowIds = ['m1', 'm2']
  hookState.table = {
    m1: { count: '1', createdAt: 1, sessionId: 's', title: ' First ' },
    m2: { count: '2', createdAt: 2, sessionId: 's', title: ' Second ' },
  }

  expect(r.messages.useGet('m1')).toEqual({
    count: 3,
    createdAt: 1,
    id: 'm1',
    sessionId: 's',
    title: 'Hello',
  })
  expect(r.messages.useHas('m1')).toBe(true)
  expect(r.messages.useIds()).toEqual(['m1', 'm2'])
  expect(r.messages.useAll().map((m) => m.id)).toEqual(['m1', 'm2'])
})

test('inferred query hook composes slice membership with table content', () => {
  const r = createApi()

  hookState.sliceRowIds = ['m1', 'missing']
  hookState.table = { m1: { count: '1', createdAt: 1, sessionId: 's', title: ' First ' } }

  expect(r.messages.useBySession('s')).toEqual([
    { count: 1, createdAt: 1, id: 'm1', sessionId: 's', title: 'First' },
  ])
})

test('store and index instances are forwarded to the underlying hooks', () => {
  const r = createApi()

  // hasRow stays false: the underlying hooks are still called (and their args asserted)
  // before the wrapper decides there is nothing to parse.
  r.messages.useGet('m1')
  r.messages.useBySession('s')
  r.values.activeId.use()

  expect(tinybaseHooks.useRow).toHaveBeenCalledWith('messages', 'm1', 'STORE')
  // Index id is namespaced by table to avoid global-namespace collisions.
  expect(tinybaseHooks.useSliceRowIds).toHaveBeenCalledWith('messages/bySession', 's', 'INDEXES')
  expect(tinybaseHooks.useValue).toHaveBeenCalledWith('activeId', 'STORE')
})

test('useRequire throws on a missing row', () => {
  const r = createApi()

  hookState.hasRow = false
  expect(() => r.messages.useRequire('gone')).toThrow(/Missing row/u)
})

test('two-way hooks parse on read and on write', () => {
  const r = createApi()

  hookState.cell = '  Edit me  '
  hookState.value = '  active  '

  const [title, setTitle] = r.messages.useFieldState('m1', 'title')
  const [active, setActive] = r.values.activeId.useState()

  expect(title).toBe('Edit me')
  expect(active).toBe('active')

  setTitle('  Next  ')
  setActive('  switched  ')

  expect(hookState.setCell).toHaveBeenCalledWith('Next')
  expect(hookState.setValue).toHaveBeenCalledWith('switched')
})

test('two-way setters reject invalid input before forwarding', () => {
  const r = createApi()

  // count is z.coerce.number(), whose input type is `unknown`, so this is type-valid;
  // the runtime parse is what must reject it.
  const [, setCount] = r.messages.useFieldState('m1', 'count')
  expect(() => {
    setCount('not a number')
  }).toThrow()
  expect(hookState.setCell).not.toHaveBeenCalled()
})
