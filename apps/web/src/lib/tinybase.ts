import { createStoreReactApi } from '@tetra/stores/react'
import {
  catalogStoreDefinition,
  libraryStoreDefinition,
  webStoreDefinition,
} from '@tetra/stores/web'

export const catalogTinybase = createStoreReactApi(catalogStoreDefinition)
export const libraryTinybase = createStoreReactApi(libraryStoreDefinition)
export const webTinybase = createStoreReactApi(webStoreDefinition)
