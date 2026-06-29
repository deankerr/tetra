// `.` — schema definition + the types core names. No store runtime.
// Surface stays demand-driven: add EntityOf/Collection/Value/etc. when a consumer needs them.
export { defineSchema, type StoreSchema } from './schema.ts'
export type { DbFor, EntitiesFor, MergeableDbFor } from './db.ts'
