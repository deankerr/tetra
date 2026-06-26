import type { LibraryTypedStore, RunConfig } from '@tetra/schemas/library'

import { createIdGenerator } from '#ids'

const nextId = createIdGenerator('run')

export function createRunRecord(
  typedStore: LibraryTypedStore,
  args: { config: RunConfig; sessionId: string; targetMessageId: string },
): string {
  const runId = nextId()
  const now = Date.now()

  typedStore.tables.runs.setRow(runId, {
    config: args.config,
    createdAt: now,
    errorMessage: '',
    sessionId: args.sessionId,
    status: 'active',
    targetMessageId: args.targetMessageId,
    terminalAt: 0,
    updatedAt: now,
  })

  return runId
}

export function completeRunRecord(typedStore: LibraryTypedStore, runId: string): void {
  const now = Date.now()
  typedStore.tables.runs.updateRow(runId, {
    status: 'completed',
    terminalAt: now,
    updatedAt: now,
  })
}

export function cancelRunRecord(typedStore: LibraryTypedStore, runId: string, message = ''): void {
  const now = Date.now()
  typedStore.tables.runs.updateRow(runId, {
    errorMessage: message,
    status: 'cancelled',
    terminalAt: now,
    updatedAt: now,
  })
}

export function failRunRecord(typedStore: LibraryTypedStore, runId: string, error: unknown): void {
  const now = Date.now()
  typedStore.tables.runs.updateRow(runId, {
    errorMessage: String(error),
    status: 'error',
    terminalAt: now,
    updatedAt: now,
  })
}
