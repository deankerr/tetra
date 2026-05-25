import { beforeEach, expect, mock, test } from 'bun:test'

import { z } from 'zod'

import { defineTypedTinybase, tinybaseIndex } from './index.ts'

interface HookState {
  cell: unknown
  hasRow: boolean
  row: Record<string, unknown>
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

await mock.module('tinybase/ui-react/with-schemas', () => ({
  useCell: mock(() => hookState.cell),
  useCellState: mock(() => [hookState.cell, hookState.setCell]),
  useHasRow: mock(() => hookState.hasRow),
  useRow: mock(() => hookState.row),
  useSliceRowIds: mock(() => hookState.sliceRowIds),
  useTable: mock(() => hookState.table),
  useValue: mock(() => hookState.value),
  useValueState: mock(() => [hookState.value, hookState.setValue]),
}))

const { createTypedTinybaseReactHooks } = await import('./react.ts')

const createHooks = () => {
  const definition = defineTypedTinybase({
    indexes: {
      sessionsByTitle: tinybaseIndex('sessions', 'title'),
    },
    tables: {
      sessions: z.object({
        messageCount: z.coerce.number().default(0),
        title: z.string().trim(),
      }),
    },
    values: {
      activeSessionId: z.string().trim().default(''),
    },
  })

  return createTypedTinybaseReactHooks(definition)
}

beforeEach(() => {
  hookState.cell = undefined
  hookState.hasRow = false
  hookState.row = {}
  hookState.setCell = mock()
  hookState.setValue = mock()
  hookState.sliceRowIds = []
  hookState.table = {}
  hookState.value = undefined
})

test('parses hook query results through the typed definition without rendering React', () => {
  const hooks = createHooks()

  hookState.cell = '  Hook title  '
  hookState.hasRow = true
  hookState.row = { messageCount: '3', title: '  Row title  ' }
  hookState.sliceRowIds = ['sess_1']
  hookState.table = {
    sess_1: { messageCount: '1', title: ' First ' },
    sess_2: { messageCount: '2', title: ' Second ' },
  }
  hookState.value = '  sess_1  '

  expect(hooks.useCell('sessions', 'sess_1', 'title')).toBe('Hook title')
  expect(hooks.useRow('sessions', 'sess_1')).toEqual({ messageCount: 3, title: 'Row title' })
  expect(hooks.useEntity('sessions', 'sess_1')).toEqual({
    id: 'sess_1',
    messageCount: 3,
    title: 'Row title',
  })
  expect(hooks.useEntityList('sessions')).toEqual([
    { id: 'sess_1', messageCount: 1, title: 'First' },
    { id: 'sess_2', messageCount: 2, title: 'Second' },
  ])
  expect(hooks.useHasRow('sessions', 'sess_1')).toBe(true)
  expect(hooks.useSliceRowIds('sessionsByTitle', 'First')).toEqual(['sess_1'])
  expect(hooks.useValue('activeSessionId')).toBe('sess_1')
})

test('returns empty hook query results when TinyBase reports no row or cell', () => {
  const hooks = createHooks()

  hookState.hasRow = false

  expect(hooks.useCell('sessions', 'missing_session', 'title')).toBeUndefined()
  expect(hooks.useRow('sessions', 'missing_session')).toBeNull()
  expect(hooks.useEntity('sessions', 'missing_session')).toBeNull()
})

test('parses hook setter inputs before forwarding them to TinyBase', () => {
  const hooks = createHooks()

  hookState.cell = '  Current  '
  hookState.value = '  sess_1  '

  const [cell, setCell] = hooks.useCellState('sessions', 'sess_1', 'title')
  const [value, setValue] = hooks.useValueState('activeSessionId')

  expect(cell).toBe('Current')
  expect(value).toBe('sess_1')

  setCell('  Next title  ')
  setValue('  sess_2  ')

  expect(hookState.setCell).toHaveBeenCalledWith('Next title')
  expect(hookState.setValue).toHaveBeenCalledWith('sess_2')
})

test('throws before hook setters forward invalid values', () => {
  const hooks = createHooks()

  hookState.value = 'sess_1'

  const [, setCell] = hooks.useCellState('sessions', 'sess_1', 'messageCount')
  const [, setValue] = hooks.useValueState('activeSessionId')

  expect(() => {
    setCell('not a number')
  }).toThrow()
  expect(() => {
    // @ts-expect-error - Runtime validation should reject invalid value inputs that bypass types.
    setValue(42)
  }).toThrow()
  expect(hookState.setCell).not.toHaveBeenCalled()
  expect(hookState.setValue).not.toHaveBeenCalled()
})
