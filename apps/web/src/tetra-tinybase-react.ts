import { tetraStoreSchema, tetraIndexIds } from '@tetra/store-schema'
import type { StoreSchemasFor } from '@tetra/tinybase-schema'
import { createStoreHooks } from '@tetra/tinybase-schema/react'
import * as UiReact from 'tinybase/ui-react/with-schemas'

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TinyBase's WithSchemas helper is exposed through a module cast.
export const tinybase = UiReact as unknown as UiReact.WithSchemas<
  StoreSchemasFor<typeof tetraStoreSchema>
>
export const typedTinybase = createStoreHooks(tetraStoreSchema, tetraIndexIds)
