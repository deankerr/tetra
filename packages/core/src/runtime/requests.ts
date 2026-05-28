import type { RequestConfig as RequestConfigType, TetraTypedStore } from '@tetra/store-schema'

import { createIdGenerator } from '#ids'

const nextId = createIdGenerator('req')

export function createRequest(
  typedStore: TetraTypedStore,
  args: { assistantMessageId: string; config: RequestConfigType; sessionId: string },
): string {
  const requestId = nextId()
  const now = Date.now()

  typedStore.tables.requests.setRow(requestId, {
    assistantMessageId: args.assistantMessageId,
    config: args.config,
    createdAt: now,
    errorMessage: '',
    sessionId: args.sessionId,
    status: 'preparing',
    terminalAt: 0,
    updatedAt: now,
  })

  return requestId
}

export function startStreaming(typedStore: TetraTypedStore, requestId: string): void {
  typedStore.tables.requests.updateRow(requestId, {
    errorMessage: '',
    status: 'streaming',
    updatedAt: Date.now(),
  })
}

export function completeRequest(typedStore: TetraTypedStore, requestId: string): void {
  const now = Date.now()
  typedStore.tables.requests.updateRow(requestId, {
    status: 'completed',
    terminalAt: now,
    updatedAt: now,
  })
}

export function cancelRequest(typedStore: TetraTypedStore, requestId: string, message = ''): void {
  const now = Date.now()
  typedStore.tables.requests.updateRow(requestId, {
    errorMessage: message,
    status: 'cancelled',
    terminalAt: now,
    updatedAt: now,
  })
}

export function failRequest(typedStore: TetraTypedStore, requestId: string, error: unknown): void {
  const now = Date.now()
  typedStore.tables.requests.updateRow(requestId, {
    errorMessage: String(error),
    status: 'error',
    terminalAt: now,
    updatedAt: now,
  })
}
