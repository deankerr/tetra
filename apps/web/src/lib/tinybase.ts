import { catalogStoreDefinition } from '@tetra/stores/catalog'
import { libraryStoreDefinition } from '@tetra/stores/library'
import { createStoreReactApi } from '@tetra/tinybase-schema/react'

import { webStoreDefinition } from '@/stores/web'

export const catalogTinybase = createStoreReactApi(catalogStoreDefinition)
export const libraryTinybase = createStoreReactApi(libraryStoreDefinition)
export const webTinybase = createStoreReactApi(webStoreDefinition)
