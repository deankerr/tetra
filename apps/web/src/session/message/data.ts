import { RunConfigSchema } from '@tetra/stores/library'
import type { LibraryRows } from '@tetra/stores/library'

import { libraryTinybase } from '@/lib/tinybase'
import { useTetra } from '@/tetra-context'

export type MessagePart = LibraryRows['messages']['parts'][number]

export function getRunModelId(run: LibraryRows['runs']): string {
  return RunConfigSchema.parse(run.config).modelId
}

export function getRunErrorMessage(run: LibraryRows['runs'] | null): string | null {
  if (run === null || run.errorMessage === '') {
    return null
  }

  return run.errorMessage
}

// An `active` run row is only a claim. The live Run object is the authority on liveness,
// so a stale row (crash, reload, or another client) never freezes the message UI. The
// status check short-circuits reactively, before the live-run lookup.
export function useMessageRunActive(run: LibraryRows['runs'] | null): boolean {
  const tetra = useTetra()
  if (run === null || run.status !== 'active') {
    return false
  }

  return tetra.runs.getByTargetMessage(run.targetMessageId) !== null
}

export function useMessageRun(messageId: string): LibraryRows['runs'] | null {
  const ids = libraryTinybase.useSliceRowIds('runsByTargetMessageNewestFirst', messageId)

  return libraryTinybase.useEntity('runs', ids[0] ?? '')
}
