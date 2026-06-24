import { beforeEach, expect, mock, test } from 'bun:test'

import { z } from 'zod'

import { defineTypedStore } from './index.ts'
import { defineStoreDefinition } from './runtime.ts'

interface HookState {
  cell: unknown
  hasRow: boolean
  indexes: unknown
  row: Record<string, unknown>
  rowIds: string[]
  setCell: ReturnType<typeof mock>
  setValue: ReturnType<typeof mock>
  sliceIds: string[]
  sliceRowIds: string[]
  store: unknown
  table: Record<string, Record<string, unknown>>
  value: unknown
}

const hookState: HookState = {
  cell: undefined,
  hasRow: false,
  indexes: undefined,
  row: {},
  rowIds: [],
  setCell: mock(),
  setValue: mock(),
  sliceIds: [],
  sliceRowIds: [],
  store: undefined,
  table: {},
  value: undefined,
}

await mock.module('react', () => ({
  useCallback: <Fn extends (...args: never[]) => unknown>(fn: Fn) => fn,
  useMemo: <Value>(factory: () => Value) => factory(),
}))

const tinybaseHooks = {
  Provider: mock(({ children }: { children: unknown }) => children),
  useCell: mock(() => hookState.cell),
  useCellState: mock(() => [hookState.cell, hookState.setCell]),
  useHasRow: mock(() => hookState.hasRow),
  useIndexes: mock(() => hookState.indexes),
  useRow: mock(() => hookState.row),
  useRowIds: mock(() => hookState.rowIds),
  useSliceIds: mock(() => hookState.sliceIds),
  useSliceRowIds: mock(() => hookState.sliceRowIds),
  useStore: mock(() => hookState.store),
  useTable: mock(() => hookState.table),
  useValue: mock(() => hookState.value),
  useValueState: mock(() => [hookState.value, hookState.setValue]),
}

await mock.module('tinybase/ui-react/with-schemas', () => tinybaseHooks)

const { createStoreHooks, createStoreReactApi, createTinyBaseProviderProps, StoreProvider } =
  await import('./react.ts')

const createStoreSchema = () =>
  defineTypedStore({
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

const createHooks = () => createStoreHooks(createStoreSchema(), ['sessionsByTitle'] as const)

const createRuntimeDefinition = () =>
  defineStoreDefinition({
    id: 'library',
    indexIds: ['sessionsByTitle'] as const,
    schema: createStoreSchema(),
  })

beforeEach(() => {
  hookState.cell = undefined
  hookState.hasRow = false
  hookState.indexes = undefined
  hookState.row = {}
  hookState.rowIds = []
  hookState.setCell = mock()
  hookState.setValue = mock()
  hookState.sliceIds = []
  hookState.sliceRowIds = []
  hookState.store = undefined
  hookState.table = {}
  hookState.value = undefined

  for (const hook of Object.values(tinybaseHooks)) {
    hook.mockClear()
  }
})

test('parses hook query results through the typed definition without rendering React', () => {
  const hooks = createHooks()

  hookState.cell = '  Hook title  '
  hookState.hasRow = true
  hookState.row = { messageCount: '3', title: '  Row title  ' }
  hookState.rowIds = ['sess_1', 'sess_2']
  hookState.sliceIds = ['First']
  hookState.sliceRowIds = ['sess_1', 'missing_session']
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
  expect(hooks.useRowIds('sessions')).toEqual(['sess_1', 'sess_2'])
  expect(hooks.useSliceIds('sessionsByTitle')).toEqual(['First'])
  expect(hooks.useSliceRowIds('sessionsByTitle', 'First')).toEqual(['sess_1', 'missing_session'])
  expect(hooks.useSliceEntities('sessionsByTitle', 'First', 'sessions')).toEqual([
    { id: 'sess_1', messageCount: 1, title: 'First' },
  ])
  expect(hooks.useValue('activeSessionId')).toBe('sess_1')
})

test('forwards named TinyBase objects to underlying hooks', () => {
  const hooks = createHooks()

  hookState.cell = '  Hook title  '
  hookState.hasRow = true
  hookState.row = { messageCount: '3', title: '  Row title  ' }
  hookState.rowIds = ['sess_1']
  hookState.sliceIds = ['First']
  hookState.sliceRowIds = ['sess_1']
  hookState.table = {
    sess_1: { messageCount: '1', title: ' First ' },
  }
  hookState.value = '  sess_1  '

  hooks.useCell('sessions', 'sess_1', 'title', 'webUi')
  hooks.useCellState('sessions', 'sess_1', 'title', 'webUi')
  hooks.useEntity('sessions', 'sess_1', 'webUi')
  hooks.useEntityList('sessions', 'webUi')
  hooks.useHasRow('sessions', 'sess_1', 'webUi')
  hooks.useRow('sessions', 'sess_1', 'webUi')
  hooks.useRowIds('sessions', 'webUi')
  hooks.useSliceEntities('sessionsByTitle', 'First', 'sessions', 'webUiIndexes', 'webUi')
  hooks.useSliceIds('sessionsByTitle', 'webUiIndexes')
  hooks.useSliceRowIds('sessionsByTitle', 'First', 'webUiIndexes')
  hooks.useValue('activeSessionId', 'webUi')
  hooks.useValueState('activeSessionId', 'webUi')

  expect(tinybaseHooks.useCell).toHaveBeenCalledWith('sessions', 'sess_1', 'title', 'webUi')
  expect(tinybaseHooks.useCellState).toHaveBeenCalledWith('sessions', 'sess_1', 'title', 'webUi')
  expect(tinybaseHooks.useHasRow).toHaveBeenCalledWith('sessions', 'sess_1', 'webUi')
  expect(tinybaseHooks.useRowIds).toHaveBeenCalledWith('sessions', 'webUi')
  expect(tinybaseHooks.useTable).toHaveBeenCalledWith('sessions', 'webUi')
  expect(tinybaseHooks.useRow).toHaveBeenCalledWith('sessions', 'sess_1', 'webUi')
  expect(tinybaseHooks.useSliceIds).toHaveBeenCalledWith('sessionsByTitle', 'webUiIndexes')
  expect(tinybaseHooks.useSliceRowIds).toHaveBeenCalledWith(
    'sessionsByTitle',
    'First',
    'webUiIndexes',
  )
  expect(tinybaseHooks.useValue).toHaveBeenCalledWith('activeSessionId', 'webUi')
  expect(tinybaseHooks.useValueState).toHaveBeenCalledWith('activeSessionId', 'webUi')
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

test('creates store-definition-bound hooks for named TinyBase stores and indexes', () => {
  const hooks = createStoreReactApi(createRuntimeDefinition())
  const rawIndexes = { kind: 'indexes' }
  const rawStore = { kind: 'store' }

  hookState.hasRow = true
  hookState.indexes = rawIndexes
  hookState.row = { messageCount: '3', title: '  Bound row  ' }
  hookState.sliceRowIds = ['sess_1']
  hookState.store = rawStore
  hookState.table = {
    sess_1: { messageCount: '1', title: ' First ' },
  }
  hookState.value = '  sess_1  '

  expect(hooks.useValue('activeSessionId')).toBe('sess_1')
  expect(hooks.useRow('sessions', 'sess_1')).toEqual({ messageCount: 3, title: 'Bound row' })
  expect(hooks.useSliceEntities('sessionsByTitle', 'First', 'sessions')).toEqual([
    { id: 'sess_1', messageCount: 1, title: 'First' },
  ])
  expect(hooks.useRawIndexes() as unknown).toBe(rawIndexes)
  expect(hooks.useRawStore() as unknown).toBe(rawStore)

  expect(tinybaseHooks.useValue).toHaveBeenCalledWith('activeSessionId', 'library')
  expect(tinybaseHooks.useRow).toHaveBeenCalledWith('sessions', 'sess_1', 'library')
  expect(tinybaseHooks.useSliceRowIds).toHaveBeenCalledWith(
    'sessionsByTitle',
    'First',
    'libraryIndexes',
  )
  expect(tinybaseHooks.useIndexes).toHaveBeenCalledWith('libraryIndexes')
  expect(tinybaseHooks.useStore).toHaveBeenCalledWith('library')
})

test('creates TinyBase provider props for named store instances', () => {
  const providerProps = createTinyBaseProviderProps({
    catalog: {
      id: 'catalog',
      rawIndexes: { kind: 'catalogIndexes' },
      rawStore: { kind: 'catalogStore' },
    },
    library: {
      id: 'library',
      rawIndexes: { kind: 'libraryIndexes' },
      rawStore: { kind: 'libraryStore' },
    },
  })

  expect(Object.keys(providerProps.storesById).toSorted()).toEqual(['catalog', 'library'])
  expect(Object.keys(providerProps.indexesById).toSorted()).toEqual([
    'catalogIndexes',
    'libraryIndexes',
  ])
})

test('forwards TinyBase provider props to the underlying React provider', () => {
  const children = 'children'
  const indexesById = { libraryIndexes: { kind: 'indexes' } }
  const storesById = { library: { kind: 'store' } }

  expect(StoreProvider({ children, indexesById, storesById })).toBe(children)
  expect(tinybaseHooks.Provider).toHaveBeenCalledWith({ children, indexesById, storesById })
})
