import { useMemo } from 'react'

import { tinybase } from '@/tetra/tinybase'

export function useGroupedLanguageModels() {
  const languageModelsTable = tinybase.useTable('languageModels')

  return useMemo(() => {
    const models = Object.entries(languageModelsTable).map(([id, row]) => ({ ...row, id }))
    const byProvider = Map.groupBy(models, (lm) => {
      const providerName = lm.providerName.toLowerCase()
      if (providerName.startsWith('~')) {
        return providerName.slice(1)
      }
      return providerName
    })

    return [...byProvider.entries()]
      .map(([providerName, groupedModels]) => ({
        models: groupedModels.toSorted((a, b) => a.name.localeCompare(b.name)),
        providerName,
      }))
      .toSorted((a, b) => a.providerName.localeCompare(b.providerName))
  }, [languageModelsTable])
}
