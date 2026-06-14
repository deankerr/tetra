import { summarizeSteps } from '@tetra/core'
import type { UsageTotals } from '@tetra/core'
import type { Rows } from '@tetra/store-schema'
import { useMemo } from 'react'

import { typedTinybase } from '@/lib/tinybase'

type StepIndexId = 'stepsByRun' | 'stepsBySession'

export function useRunSteps(runId: string | undefined): Rows['steps'][] {
  return useStepsBySlice('stepsByRun', runId ?? '')
}

export function useSessionUsageTotals(sessionId: string): UsageTotals {
  const steps = useStepsBySlice('stepsBySession', sessionId)

  return useMemo(() => summarizeSteps(steps), [steps])
}

function useStepsBySlice(indexId: StepIndexId, sliceId: string): Rows['steps'][] {
  return typedTinybase.useSliceEntities(indexId, sliceId, 'steps')
}
