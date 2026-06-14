import { RunConfigSchema } from '@tetra/store-schema'
import type { Rows } from '@tetra/store-schema'

import { typedTinybase } from '@/lib/tinybase'
import { useTetra } from '@/tetra-context'

export type MessagePart = Rows['messages']['parts'][number]

export function getRunModelId(run: Rows['runs']): string {
  return RunConfigSchema.parse(run.config).modelId
}

export function getRunErrorMessage(run: Rows['runs'] | null): string | null {
  if (run === null || run.errorMessage === '') {
    return null
  }

  return run.errorMessage
}

// An `active` run row is only a claim. The live Run object is the authority on liveness,
// so a stale row (crash, reload, or another client) never freezes the message UI. The
// status check short-circuits reactively, before the live-run lookup.
export function useMessageRunActive(run: Rows['runs'] | null): boolean {
  const tetra = useTetra()
  if (run === null || run.status !== 'active') {
    return false
  }

  return tetra.runs.getByTargetMessage(run.targetMessageId) !== null
}

export function useMessageRun(messageId: string): Rows['runs'] | null {
  const ids = typedTinybase.useSliceRowIds('runsByTargetMessageNewestFirst', messageId)

  return typedTinybase.useEntity('runs', ids[0] ?? '')
}
