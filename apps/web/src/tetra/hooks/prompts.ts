import type { Rows } from '@tetra/core'
import { useMemo } from 'react'

import { typedTinybase } from '@/tetra/tinybase'

export const usePromptIds = () => {
  const prompts = typedTinybase.useEntityList('prompts')
  return useMemo(
    () =>
      prompts.toSorted((left, right) => left.id.localeCompare(right.id)).map((prompt) => prompt.id),
    [prompts],
  )
}

export const usePrompt = (id: string): Rows.Prompt | null => {
  const prompt = typedTinybase.useEntity('prompts', id)
  if (id === '') {
    return null
  }

  return prompt
}
