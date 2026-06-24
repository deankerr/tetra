import { catalogStoreDefinition, libraryStoreDefinition } from '@tetra/stores'
import { createStoreReactApi } from '@tetra/stores/react'

import { webStoreDefinition } from '@/stores/web'

export const catalogTinybase = createStoreReactApi(catalogStoreDefinition)
export const libraryTinybase = createStoreReactApi(libraryStoreDefinition)
export const webTinybase = createStoreReactApi(webStoreDefinition)
