import type { TinybaseTypedStore } from '@tetra/tinybase-schema'

import { createIdGenerator } from '#db'
import type { RequestConfig as RequestConfigType, tetraDbDefinition } from '#db'
import type { Helpers } from '#helpers'

import { commitMessageGeneration, updateMessageGeneration } from './message-generations.ts'

const nextId = createIdGenerator('req')

export function createRequest(
  typedStore: TinybaseTypedStore<typeof tetraDbDefinition>,
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

export function startStreaming(
  typedStore: TinybaseTypedStore<typeof tetraDbDefinition>,
  requestId: string,
): void {
  typedStore.tables.requests.updateRow(requestId, {
    errorMessage: '',
    status: 'streaming',
    updatedAt: Date.now(),
  })
}

export function completeRequest(
  typedStore: TinybaseTypedStore<typeof tetraDbDefinition>,
  requestId: string,
): void {
  const now = Date.now()
  typedStore.tables.requests.updateRow(requestId, {
    status: 'completed',
    terminalAt: now,
    updatedAt: now,
  })
}

export function cancelRequest(
  typedStore: TinybaseTypedStore<typeof tetraDbDefinition>,
  requestId: string,
  message = '',
): void {
  const now = Date.now()
  typedStore.tables.requests.updateRow(requestId, {
    errorMessage: message,
    status: 'cancelled',
    terminalAt: now,
    updatedAt: now,
  })
}

export function failRequest(
  typedStore: TinybaseTypedStore<typeof tetraDbDefinition>,
  requestId: string,
  error: unknown,
): void {
  const now = Date.now()
  typedStore.tables.requests.updateRow(requestId, {
    errorMessage: String(error),
    status: 'error',
    terminalAt: now,
    updatedAt: now,
  })
}

export function recoverInterrupted(helpers: Helpers, message = 'Request interrupted'): void {
  const { typedStore } = helpers

  for (const requestId of typedStore.tables.requests.getRowIds()) {
    const status = typedStore.tables.requests.getCell(requestId, 'status')
    if (status === 'preparing' || status === 'streaming') {
      failRequest(typedStore, requestId, message)
    }
  }

  for (const messageId of typedStore.tables.messageGenerations.getRowIds()) {
    const status = typedStore.tables.messageGenerations.getCell(messageId, 'status')
    if (status === 'preparing' || status === 'streaming') {
      updateMessageGeneration(helpers, messageId, { status: 'error' })
    }
    commitMessageGeneration(helpers, messageId)
  }
}
