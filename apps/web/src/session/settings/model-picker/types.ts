import type { Rows } from '@tetra/store-schema'

export type LanguageModel = Rows['languageModels'] & { id: string }
