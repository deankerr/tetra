import type { RowZod } from './types.ts'

export type TableDefinitions = Record<string, RowZod>
export type TableSchemaOf<Table extends RowZod> = Table
