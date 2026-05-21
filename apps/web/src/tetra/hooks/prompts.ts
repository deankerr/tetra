import type { Rows } from '@tetra/core'
import { useMemo } from 'react'

import { tinybase } from '@/tetra/tinybase'

export const usePromptIds = () => {
  const prompts = tinybase.useTable('prompts')
  return useMemo(
    () =>
      Object.entries(prompts)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([promptId]) => promptId),
    [prompts],
  )
}

export const usePrompt = (id: string): Rows.Prompt | null => {
  const hasRow = tinybase.useHasRow('prompts', id)
  const row = tinybase.useRow('prompts', id)
  if (!hasRow || id === '') {
    return null
  }

  return { ...row, id }
}
