import { summarizeSteps } from '@tetra/core'
import type { UsageTotals } from '@tetra/core'
import type { Rows } from '@tetra/store-schema'
import { useMemo } from 'react'

import { typedTinybase } from '@/lib/tinybase'

type StepIndexId = 'stepsByRequest' | 'stepsBySession'

export function useRequestSteps(requestId: string | undefined): Rows['steps'][] {
  return useStepsBySlice('stepsByRequest', requestId ?? '')
}

export function useSessionUsageTotals(sessionId: string): UsageTotals {
  const steps = useStepsBySlice('stepsBySession', sessionId)

  return useMemo(() => summarizeSteps(steps), [steps])
}

function useStepsBySlice(indexId: StepIndexId, sliceId: string): Rows['steps'][] {
  const stepIds = typedTinybase.useSliceRowIds(indexId, sliceId)
  const steps = typedTinybase.useEntityList('steps')

  return useMemo(() => {
    const stepsById = new Map(steps.map((step) => [step.id, step]))
    return stepIds
      .map((stepId) => stepsById.get(stepId))
      .filter((step): step is Rows['steps'] => step !== undefined)
  }, [stepIds, steps])
}
