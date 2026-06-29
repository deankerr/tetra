import type { EntityOf, NewOf, RowZod, StoreApi } from './types.ts'

// Reads and writes are split so React can derive its surface from the read half
// (every read becomes a `use`-hook; writes stay imperative). The split also marks
// which methods carry invariants.
// Exported because the React module derives its read surface from this half.
export interface CollectionReads<Entity> {
  all(): Entity[]
  get(id: string): Entity | null
  has(id: string): boolean
  ids(): string[]
  require(id: string): Entity
}

interface CollectionWrites<New> {
  create(id: string, data: New): void
  delete(id: string): void
  set(id: string, data: New): void
  update(id: string, patch: Partial<New>): void
}

export type Collection<Entity, New> = CollectionReads<Entity> & CollectionWrites<New>

// Single source of the entity shape: parse the row, then attach its id.
export function parseEntity<Table extends RowZod>(
  schema: Table,
  rowId: string,
  row: unknown,
): EntityOf<Table> {
  return { ...schema.parse(row), id: rowId }
}

// oxlint-disable no-unsafe-argument, no-unsafe-type-assertion -- TinyBase stores coarse cells; zod owns the precise boundary parse.

export function makeCollection<Table extends RowZod>(
  store: StoreApi,
  tableId: string,
  schema: Table,
): Collection<EntityOf<Table>, NewOf<Table>> {
  return {
    all() {
      return store
        .getRowIds(tableId)
        .map((rowId) => parseEntity(schema, rowId, store.getRow(tableId, rowId)))
    },

    create(id, data) {
      if (store.hasRow(tableId, id)) {
        throw new Error(`Row already exists: ${tableId}/${id}`)
      }
      store.setRow(tableId, id, schema.parse(data) as never)
    },

    delete(id) {
      store.delRow(tableId, id)
    },

    get(id) {
      if (!store.hasRow(tableId, id)) {
        return null
      }
      return parseEntity(schema, id, store.getRow(tableId, id))
    },

    has(id) {
      return store.hasRow(tableId, id)
    },

    ids() {
      return [...store.getRowIds(tableId)]
    },

    require(id) {
      if (!store.hasRow(tableId, id)) {
        throw new Error(`Missing row: ${tableId}/${id}`)
      }
      return parseEntity(schema, id, store.getRow(tableId, id))
    },

    set(id, data) {
      store.setRow(tableId, id, schema.parse(data) as never)
    },

    // Field-patch: existence-check, validate each patched cell against its own zod
    // schema, write those cells. No whole-row read/merge.
    update(id, patch) {
      if (!store.hasRow(tableId, id)) {
        throw new Error(`Missing row: ${tableId}/${id}`)
      }
      for (const [cellId, value] of Object.entries(patch as Record<string, unknown>)) {
        const cellSchema = schema.shape[cellId]
        if (cellSchema === undefined) {
          throw new Error(`Unknown cell: ${tableId}.${cellId}`)
        }
        store.setCell(tableId, id, cellId, cellSchema.parse(value) as never)
      }
    },
  }
}
