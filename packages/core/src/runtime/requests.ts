import { createIdGenerator } from '#db'
import type { RequestConfig as RequestConfigType, TetraDb } from '#db'
import type { Store } from '#store'

import { commitMessageGeneration, updateMessageGeneration } from './message-generations.ts'

const nextId = createIdGenerator('req')

export function createRequest(
  db: TetraDb,
  args: { assistantMessageId: string; config: RequestConfigType; sessionId: string },
): string {
  const requestId = nextId()

  db.tables.requests.setRow(requestId, {
    assistantMessageId: args.assistantMessageId,
    config: args.config,
    createdAt: Date.now(),
    errorMessage: '',
    sessionId: args.sessionId,
    status: 'preparing',
    terminalAt: 0,
  })

  return requestId
}

export function startStreaming(db: TetraDb, requestId: string): void {
  db.tables.requests.updateRow(requestId, { errorMessage: '', status: 'streaming' })
}

export function completeRequest(db: TetraDb, requestId: string): void {
  db.tables.requests.updateRow(requestId, { status: 'completed', terminalAt: Date.now() })
}

export function cancelRequest(db: TetraDb, requestId: string, message = ''): void {
  db.tables.requests.updateRow(requestId, {
    errorMessage: message,
    status: 'cancelled',
    terminalAt: Date.now(),
  })
}

export function failRequest(db: TetraDb, requestId: string, error: unknown): void {
  db.tables.requests.updateRow(requestId, {
    errorMessage: String(error),
    status: 'error',
    terminalAt: Date.now(),
  })
}

export function recoverInterrupted(store: Store, message = 'Request interrupted'): void {
  const { db } = store

  for (const requestId of db.tables.requests.getRowIds()) {
    const status = db.tables.requests.getCell(requestId, 'status')
    if (status === 'preparing' || status === 'streaming') {
      failRequest(db, requestId, message)
    }
  }

  for (const messageId of db.tables.messageGenerations.getRowIds()) {
    const status = db.tables.messageGenerations.getCell(messageId, 'status')
    if (status === 'preparing' || status === 'streaming') {
      updateMessageGeneration(store, messageId, { status: 'error' })
    }
    commitMessageGeneration(store, messageId)
  }
}
