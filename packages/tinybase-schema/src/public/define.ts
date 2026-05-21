import { createStore as createTinybaseStore } from 'tinybase/store/with-schemas'
import type { z } from 'zod'

import { createIndexesApi, createIndexesFromDefinitions } from '../internal/index-api.ts'
import {
  createTableApi,
  createValueApi,
  parseEntity,
  parseRow,
  parseValue,
} from '../internal/store-api.ts'
import { toTinybaseTablesSchema, toTinybaseValuesSchema } from '../internal/tinybase-schema.ts'
import type {
  BoundTinybase,
  EntityOf,
  IndexDefinitions,
  OutputRowOf,
  TableApi,
  TableDefinitions,
  TableSchemaOf,
  TinybaseDefinition,
  TinybaseSchemasOf,
  TinybaseTablesSchemaOf,
  TinybaseStore,
  TinybaseValuesSchemaOf,
  ValueApi,
  ValueDefinitions,
} from './types.ts'

// oxlint-disable no-unsafe-type-assertion -- This is the library boundary that binds typed definitions to TinyBase's schema-aware Store.

export function defineTypedTinybase<
  const Tables extends TableDefinitions,
  const Values extends ValueDefinitions = Record<never, never>,
  const IndexDefs extends IndexDefinitions<Tables> = Record<never, never>,
>({
  indexes,
  tables,
  values,
}: {
  indexes?: IndexDefs
  tables: Tables
  values?: Values
}): TinybaseDefinition<Tables, Values, IndexDefs> {
  const typedValues = (values ?? {}) as Values
  const typedIndexes = (indexes ?? {}) as IndexDefs
  const tinybaseTablesSchema = toTinybaseTablesSchema(tables) as TinybaseTablesSchemaOf<Tables>
  const tinybaseValuesSchema = toTinybaseValuesSchema(typedValues) as TinybaseValuesSchemaOf<Values>

  return {
    bindTinybaseIndexes(rawIndexes) {
      return createIndexesApi(rawIndexes, typedIndexes)
    },

    bindTinybaseStore(store) {
      const base = {
        getTable<TableId extends keyof Tables & string>(
          tableId: TableId,
        ): TableApi<TableSchemaOf<Tables[TableId]>> {
          return createTableApi(store, tableId, tables[tableId].schema)
        },
        getValue<ValueId extends keyof Values & string>(
          valueId: ValueId,
        ): ValueApi<Values[ValueId]['schema']> {
          return createValueApi(store, valueId, typedValues[valueId].schema)
        },
        store,
        transaction(fn: () => void): void {
          store.transaction(fn)
        },
      }

      const accessors = Object.fromEntries(
        (Object.keys(tables) as (keyof Tables & string)[]).map((tableId) => [
          tableId,
          createTableApi(store, tableId, tables[tableId].schema),
        ]),
      )

      return Object.assign(base, accessors) as BoundTinybase<Tables, Values>
    },

    createTinybaseIndexes(store) {
      return createIndexesFromDefinitions(
        store,
        typedIndexes as unknown as IndexDefinitions<TableDefinitions>,
      )
    },

    createTinybaseStore() {
      const storeTablesSchema = structuredClone(tinybaseTablesSchema)
      const storeValuesSchema = structuredClone(tinybaseValuesSchema)
      return createTinybaseStore().setSchema(
        storeTablesSchema,
        storeValuesSchema,
      ) as unknown as TinybaseStore<TinybaseSchemasOf<Tables, Values>>
    },

    getCellSchema(tableId, cellId) {
      return tables[tableId].fields[cellId].schema
    },

    indexes: typedIndexes,

    // oxlint-disable-next-line no-unnecessary-type-parameters -- The contextual interface uses TableId to connect the table id to the returned entity type.
    parseEntity<TableId extends keyof Tables & string>(
      tableId: TableId,
      rowId: string,
      row: unknown,
    ) {
      return parseEntity(tables[tableId].schema, rowId, row) as EntityOf<
        TableSchemaOf<Tables[TableId]>
      >
    },

    parseRow<TableId extends keyof Tables & string>(tableId: TableId, row: unknown) {
      return parseRow(tables[tableId].schema, row) as OutputRowOf<TableSchemaOf<Tables[TableId]>>
    },

    parseValue<ValueId extends keyof Values & string>(valueId: ValueId, value: unknown) {
      return parseValue(typedValues[valueId].schema, value) as z.output<Values[ValueId]['schema']>
    },

    tables,
    tinybaseTablesSchema,
    tinybaseValuesSchema,
    values: typedValues,
  }
}
