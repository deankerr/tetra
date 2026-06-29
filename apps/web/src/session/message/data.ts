import { RunConfigSchema } from '@tetra/schemas/library'
import type { LibraryEntities } from '@tetra/schemas/library'

import { useApp } from '@/app'
import { libraryReact } from '@/store'

export type MessagePart = LibraryEntities['messages']['parts'][number]

export function getRunModelId(run: LibraryEntities['runs']): string {
  return RunConfigSchema.parse(run.config).modelId
}

export function getRunErrorMessage(run: LibraryEntities['runs'] | null): string | null {
  if (run === null || run.errorMessage === '') {
    return null
  }

  return run.errorMessage
}

// An `active` run row is only a claim. The live Run object is the authority on liveness,
// so a stale row (crash, reload, or another client) never freezes the message UI. The
// status check short-circuits reactively, before the live-run lookup.
export function useMessageRunActive(run: LibraryEntities['runs'] | null): boolean {
  const tetra = useApp()
  if (run === null || run.status !== 'active') {
    return false
  }

  return tetra.runs.getByTargetMessage(run.targetMessageId) !== null
}

export function useMessageRun(messageId: string): LibraryEntities['runs'] | null {
  return libraryReact.runs.useByTargetMessageNewestFirst(messageId)[0] ?? null
}
