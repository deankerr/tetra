import type { z } from 'zod'

import type { AnyZod, StoreApi } from './types.ts'

// A value is a typed singleton: get returns output, set takes input and returns void.
export interface Value<Out, In> {
  get(): Out
  set(value: In): void
}

// oxlint-disable no-unsafe-type-assertion -- zod owns the boundary; TinyBase stores the coarse value.

export function makeValue<Schema extends AnyZod>(
  store: StoreApi,
  valueId: string,
  schema: Schema,
): Value<z.output<Schema>, z.input<Schema>> {
  return {
    get() {
      return schema.parse(store.getValue(valueId)) as z.output<Schema>
    },

    set(value) {
      store.setValue(valueId, schema.parse(value) as never)
    },
  }
}
