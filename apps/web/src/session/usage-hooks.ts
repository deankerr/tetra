import { summarizeSteps } from '@tetra/core'
import type { UsageTotals } from '@tetra/core'
import type { LibraryRows } from '@tetra/stores/web'
import { useMemo } from 'react'

import { libraryTinybase } from '@/lib/tinybase'

type StepIndexId = 'stepsByRun' | 'stepsBySession'

export function useRunSteps(runId: string | undefined): LibraryRows['steps'][] {
  return useStepsBySlice('stepsByRun', runId ?? '')
}

export function useSessionUsageTotals(sessionId: string): UsageTotals {
  const steps = useStepsBySlice('stepsBySession', sessionId)

  return useMemo(() => summarizeSteps(steps), [steps])
}

function useStepsBySlice(indexId: StepIndexId, sliceId: string): LibraryRows['steps'][] {
  return libraryTinybase.useSliceEntities(indexId, sliceId, 'steps')
}
