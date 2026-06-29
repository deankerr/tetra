import { useCallback, useMemo } from 'react'
import * as UiReact from 'tinybase/ui-react/with-schemas'
import type { z } from 'zod'

import { parseEntity } from './collection.ts'
import type { CollectionReads } from './collection.ts'
import type { DbFor } from './db.ts'
import type { QueriesForTable } from './query.ts'
import type { AnyStoreSchema, StoreSchema } from './schema.ts'
import type { AnyZod, EntityOf, NewOf, RowZod } from './types.ts'

// The React surface is `db`'s read surface, mechanically: every read/query method
// `use`-prefixed with its signature unchanged. Writes and batch are absent because they
// live on the write half, which this never touches. No parallel interface is declared.
type Reactify<Methods> = {
  [Name in keyof Methods & string as `use${Capitalize<Name>}`]: Methods[Name]
}

// The one two-way hook per collection: read a field reactively, write it imperatively.
// Invariant-carrying writes still go through core commands, not this.
interface FieldStateHook<Table extends RowZod> {
  useFieldState<Field extends keyof NewOf<Table> & string>(
    id: string,
    field: Field,
  ): [z.output<Table>[Field] | undefined, (value: NewOf<Table>[Field]) => void]
}

type ReactCollection<Table extends RowZod, TableIndexes> = FieldStateHook<Table> &
  Reactify<CollectionReads<EntityOf<Table>> & QueriesForTable<Table, TableIndexes>>

interface ReactValue<Schema extends AnyZod> {
  use(): z.output<Schema>
  useState(): [z.output<Schema>, (value: z.input<Schema>) => void]
}

export type ReactDbFor<Schema extends AnyStoreSchema> =
  Schema extends StoreSchema<infer Tables, infer Values, infer Indexes>
    ? {
        [TableId in keyof Tables]: ReactCollection<Tables[TableId], Indexes[TableId]>
      } & {
        values: { [ValueId in keyof Values]: ReactValue<Values[ValueId]> }
      }
    : never

// Loose view of TinyBase's React hooks: the with-schemas generics are escaped here and the
// precise shapes are re-asserted by ReactDbFor at the boundary. Stores/indexes are passed as
// instances (the trailing arg), so there is no Provider or string-id context.
interface LooseHooks {
  useCellState(t: string, r: string, c: string, store: unknown): [unknown, (v: unknown) => void]
  useHasRow(t: string, r: string, store: unknown): boolean
  useRow(t: string, r: string, store: unknown): Record<string, unknown>
  useRowIds(t: string, store: unknown): string[]
  useSliceRowIds(i: string, s: string, indexes: unknown): string[]
  useTable(t: string, store: unknown): Record<string, Record<string, unknown>>
  useValue(v: string, store: unknown): unknown
  useValueState(v: string, store: unknown): [unknown, (v: unknown) => void]
}

// oxlint-disable no-unsafe-argument, no-unsafe-type-assertion -- zod owns the boundary parse; TinyBase hooks hand back coarse cells.

const hooks = UiReact as unknown as LooseHooks

export function createDbReactApi<const Schema extends AnyStoreSchema>(
  schema: Schema,
  db: DbFor<Schema>,
): ReactDbFor<Schema> {
  const { raw } = db as unknown as { raw: { indexes: unknown; store: unknown } }

  const api: Record<string, unknown> = {
    values: Object.fromEntries(
      Object.entries(schema.values).map(([valueId, valueSchema]) => [
        valueId,
        makeReactValue(raw.store, valueId, valueSchema),
      ]),
    ),
  }

  for (const [tableId, table] of Object.entries(schema.tables)) {
    const tableIndexes = schema.indexes[tableId] ?? {}
    api[tableId] = makeReactCollection(raw.store, raw.indexes, tableId, table, tableIndexes)
  }

  return api as ReactDbFor<Schema>
}

function makeReactCollection(
  store: unknown,
  indexes: unknown,
  tableId: string,
  table: RowZod,
  tableIndexes: Record<string, unknown>,
): Record<string, unknown> {
  const collection: Record<string, unknown> = {
    useAll() {
      const rows = hooks.useTable(tableId, store)
      return useMemo(
        () => Object.entries(rows).map(([rowId, row]) => parseEntity(table, rowId, row)),
        [rows],
      )
    },

    useFieldState(id: string, field: string) {
      const [cell, setCell] = hooks.useCellState(tableId, id, field, store)
      const cellSchema = table.shape[field]
      if (cellSchema === undefined) {
        throw new Error(`Unknown cell: ${tableId}.${field}`)
      }
      const value = useMemo(
        () => (cell === undefined ? undefined : cellSchema.parse(cell)),
        [cell, cellSchema],
      )
      const setValue = useCallback(
        (next: unknown) => {
          setCell(cellSchema.parse(next))
        },
        [cellSchema, setCell],
      )
      return [value, setValue]
    },

    useGet(id: string) {
      const has = hooks.useHasRow(tableId, id, store)
      const row = hooks.useRow(tableId, id, store)
      return useMemo(() => (has ? parseEntity(table, id, row) : null), [has, row, id])
    },

    useHas(id: string) {
      return hooks.useHasRow(tableId, id, store)
    },

    useIds() {
      return hooks.useRowIds(tableId, store)
    },

    useRequire(id: string) {
      const has = hooks.useHasRow(tableId, id, store)
      const row = hooks.useRow(tableId, id, store)
      return useMemo(() => {
        if (!has) {
          throw new Error(`Missing row: ${tableId}/${id}`)
        }
        return parseEntity(table, id, row)
      }, [has, row, id])
    },
  }

  // One reactive query hook per declared index, named like its `db` counterpart.
  for (const name of Object.keys(tableIndexes)) {
    // Index id namespaced by table to match createDb (TinyBase index ids are global).
    const indexId = `${tableId}/${name}`
    collection[`use${capitalize(name)}`] = (key: unknown) => {
      const rowIds = hooks.useSliceRowIds(indexId, String(key), indexes)
      const rows = hooks.useTable(tableId, store)
      return useMemo(
        () =>
          rowIds.flatMap((rowId) =>
            rowId in rows ? [parseEntity(table, rowId, rows[rowId])] : [],
          ),
        [rowIds, rows],
      )
    }
  }

  return collection
}

function makeReactValue(
  store: unknown,
  valueId: string,
  valueSchema: AnyZod,
): Record<string, unknown> {
  return {
    use() {
      const value = hooks.useValue(valueId, store)
      return useMemo(() => valueSchema.parse(value), [value])
    },

    useState() {
      const [value, setValue] = hooks.useValueState(valueId, store)
      const parsed = useMemo(() => valueSchema.parse(value), [value])
      const set = useCallback(
        (next: unknown) => {
          setValue(valueSchema.parse(next))
        },
        [setValue],
      )
      return [parsed, set]
    },
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
