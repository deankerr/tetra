import { SessionRunConfigSchema } from '@tetra/schemas/library'
import type { RunConfig } from '@tetra/schemas/library'
import { useCallback } from 'react'

import { useApp } from '@/app'
import { libraryTinybase } from '@/store'

export function useSessionRunConfig(sessionId: string) {
  const { stores } = useApp()
  const libraryStore = stores.library.typedStore
  const storedConfig = libraryTinybase.useCell('sessions', sessionId, 'config')
  const config = SessionRunConfigSchema.parse(storedConfig ?? {})

  // Patch from the latest store value so field editors do not capture stale config objects.
  const updateConfig = useCallback(
    (partial: Partial<RunConfig>) => {
      const existing = libraryStore.tables.sessions.requireEntity(sessionId).config
      const nextConfig = SessionRunConfigSchema.parse({ ...existing, ...partial })
      libraryStore.tables.sessions.setCell(sessionId, 'config', nextConfig)
    },
    [libraryStore, sessionId],
  )

  return [config, updateConfig] as const
}
