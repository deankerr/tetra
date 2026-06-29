import { summarizeSteps } from '@tetra/core'
import type { UsageTotals } from '@tetra/core'
import type { LibraryEntities } from '@tetra/schemas/library'
import { useMemo } from 'react'

import { libraryReact } from '@/store'

export function useRunSteps(runId: string | undefined): LibraryEntities['steps'][] {
  return libraryReact.steps.useByRun(runId ?? '')
}

export function useSessionUsageTotals(sessionId: string): UsageTotals {
  const steps = libraryReact.steps.useBySession(sessionId)

  return useMemo(() => summarizeSteps(steps), [steps])
}
