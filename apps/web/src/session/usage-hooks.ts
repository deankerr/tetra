import { summarizeSteps } from '@tetra/core'
import type { UsageTotals } from '@tetra/core'
import { tetraStoreSchema } from '@tetra/store-schema'
import type { Rows } from '@tetra/store-schema'
import { useMemo } from 'react'

import { tinybase, typedTinybase } from '@/lib/tinybase'

type StepIndexId = 'stepsByRequest' | 'stepsBySession'

export function useRequestSteps(requestId: string | undefined): Rows['steps'][] {
  return useStepsBySlice('stepsByRequest', requestId ?? '')
}

export function useSessionUsageTotals(sessionId: string): UsageTotals {
  const steps = useStepsBySlice('stepsBySession', sessionId)

  return useMemo(() => summarizeSteps(steps), [steps])
}

function useStepsBySlice(indexId: StepIndexId, sliceId: string): Rows['steps'][] {
  const rawStore = tinybase.useStore()
  const stepIds = typedTinybase.useSliceRowIds(indexId, sliceId)

  return useMemo(() => {
    if (rawStore === undefined) {
      return []
    }

    return stepIds
      .map((stepId) => {
        if (!rawStore.hasRow('steps', stepId)) {
          return null
        }

        return tetraStoreSchema.parseEntity('steps', stepId, rawStore.getRow('steps', stepId))
      })
      .filter((step): step is Rows['steps'] => step !== null)
  }, [rawStore, stepIds])
}
