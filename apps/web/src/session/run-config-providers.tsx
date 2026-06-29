import { SessionRunConfigSchema } from '@tetra/schemas/library'
import type { RunConfig } from '@tetra/schemas/library'
import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'

import { useApp } from '@/app'
import { libraryReact } from '@/store'

interface RunConfigContextValue {
  config: RunConfig
  sessionId: string | null
  updateConfig: (partial: Partial<RunConfig>) => void
}

const RunConfigContext = createContext<RunConfigContextValue | null>(null)

export function PersistedRunConfigProvider({
  children,
  sessionId,
}: {
  children: ReactNode
  sessionId: string
}) {
  const { stores } = useApp()
  const { library } = stores
  const [storedConfig] = libraryReact.sessions.useFieldState(sessionId, 'config')
  const config = SessionRunConfigSchema.parse(storedConfig ?? {})

  // Patch from the latest store value so field editors do not capture stale config objects.
  const updateConfig = useCallback(
    (partial: Partial<RunConfig>) => {
      const existing = library.sessions.require(sessionId).config
      const nextConfig = SessionRunConfigSchema.parse({ ...existing, ...partial })
      library.sessions.update(sessionId, { config: nextConfig })
    },
    [library, sessionId],
  )

  const value = useMemo(
    () => ({ config, sessionId, updateConfig }),
    [config, sessionId, updateConfig],
  )

  return <RunConfigContext.Provider value={value}>{children}</RunConfigContext.Provider>
}

export function DraftRunConfigProvider({ children }: { children: ReactNode }) {
  const { runConfigs } = useApp()
  const [config, setConfig] = useState<RunConfig>(() => runConfigs.createForSession())

  // Drafts are ordinary config objects until submit materializes a real session.
  const updateConfig = useCallback((partial: Partial<RunConfig>) => {
    setConfig((existing) => SessionRunConfigSchema.parse({ ...existing, ...partial }))
  }, [])

  const value = useMemo(() => ({ config, sessionId: null, updateConfig }), [config, updateConfig])

  return <RunConfigContext.Provider value={value}>{children}</RunConfigContext.Provider>
}

export function useRunConfig() {
  const ctx = useContext(RunConfigContext)
  if (ctx === null) {
    throw new Error('useRunConfig must be used within a run config provider')
  }

  return ctx
}
