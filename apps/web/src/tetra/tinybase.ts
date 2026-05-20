import type { DbSchemas } from '@tetra/core-redesign'
import * as UiReact from 'tinybase/ui-react/with-schemas'

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TinyBase's WithSchemas helper is exposed through a module cast.
export const tinybase = UiReact as unknown as UiReact.WithSchemas<DbSchemas>
