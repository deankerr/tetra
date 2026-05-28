import type { RunConfig, TetraTypedStore } from '@tetra/store-schema'

import { createIdGenerator } from '#ids'

const nextId = createIdGenerator('run')

export function createRunRecord(
  typedStore: TetraTypedStore,
  args: { assistantMessageId: string; config: RunConfig; sessionId: string },
): string {
  const runId = nextId()
  const now = Date.now()

  typedStore.tables.runs.setRow(runId, {
    assistantMessageId: args.assistantMessageId,
    config: args.config,
    createdAt: now,
    errorMessage: '',
    sessionId: args.sessionId,
    status: 'preparing',
    terminalAt: 0,
    updatedAt: now,
  })

  return runId
}

export function startRunStreaming(typedStore: TetraTypedStore, runId: string): void {
  typedStore.tables.runs.updateRow(runId, {
    errorMessage: '',
    status: 'streaming',
    updatedAt: Date.now(),
  })
}

export function completeRunRecord(typedStore: TetraTypedStore, runId: string): void {
  const now = Date.now()
  typedStore.tables.runs.updateRow(runId, {
    status: 'completed',
    terminalAt: now,
    updatedAt: now,
  })
}

export function cancelRunRecord(typedStore: TetraTypedStore, runId: string, message = ''): void {
  const now = Date.now()
  typedStore.tables.runs.updateRow(runId, {
    errorMessage: message,
    status: 'cancelled',
    terminalAt: now,
    updatedAt: now,
  })
}

export function failRunRecord(typedStore: TetraTypedStore, runId: string, error: unknown): void {
  const now = Date.now()
  typedStore.tables.runs.updateRow(runId, {
    errorMessage: String(error),
    status: 'error',
    terminalAt: now,
    updatedAt: now,
  })
}
