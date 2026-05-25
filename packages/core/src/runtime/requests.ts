import { createIdGenerator } from '#db'
import type { RequestConfig as RequestConfigType } from '#db'
import type { TetraDb } from '#db-binding'
import type { Helpers } from '#helpers'

import { commitMessageGeneration, updateMessageGeneration } from './message-generations.ts'

const nextId = createIdGenerator('req')

export function createRequest(
  db: TetraDb,
  args: { assistantMessageId: string; config: RequestConfigType; sessionId: string },
): string {
  const requestId = nextId()
  const now = Date.now()

  db.tables.requests.setRow(requestId, {
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

export function startStreaming(db: TetraDb, requestId: string): void {
  db.tables.requests.updateRow(requestId, {
    errorMessage: '',
    status: 'streaming',
    updatedAt: Date.now(),
  })
}

export function completeRequest(db: TetraDb, requestId: string): void {
  const now = Date.now()
  db.tables.requests.updateRow(requestId, {
    status: 'completed',
    terminalAt: now,
    updatedAt: now,
  })
}

export function cancelRequest(db: TetraDb, requestId: string, message = ''): void {
  const now = Date.now()
  db.tables.requests.updateRow(requestId, {
    errorMessage: message,
    status: 'cancelled',
    terminalAt: now,
    updatedAt: now,
  })
}

export function failRequest(db: TetraDb, requestId: string, error: unknown): void {
  const now = Date.now()
  db.tables.requests.updateRow(requestId, {
    errorMessage: String(error),
    status: 'error',
    terminalAt: now,
    updatedAt: now,
  })
}

export function recoverInterrupted(helpers: Helpers, message = 'Request interrupted'): void {
  const { db } = helpers

  for (const requestId of db.tables.requests.getRowIds()) {
    const status = db.tables.requests.getCell(requestId, 'status')
    if (status === 'preparing' || status === 'streaming') {
      failRequest(db, requestId, message)
    }
  }

  for (const messageId of db.tables.messageGenerations.getRowIds()) {
    const status = db.tables.messageGenerations.getCell(messageId, 'status')
    if (status === 'preparing' || status === 'streaming') {
      updateMessageGeneration(helpers, messageId, { status: 'error' })
    }
    commitMessageGeneration(helpers, messageId)
  }
}
