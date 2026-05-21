import { createIdGenerator } from '#db'
import type { RequestConfig as RequestConfigType, StepRecord, TetraDb } from '#db'

const nextId = createIdGenerator('req')

function getSteps(db: TetraDb, requestId: string): StepRecord[] {
  return db.tables.requests.getCell(requestId, 'steps') ?? []
}

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
    steps: [],
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

export function appendStep(db: TetraDb, requestId: string, step: StepRecord): void {
  const steps = getSteps(db, requestId)
  db.tables.requests.setCell(requestId, 'steps', [...steps, step])
}

export function recoverInterrupted(db: TetraDb, message = 'Request interrupted'): void {
  for (const requestId of db.tables.requests.getRowIds()) {
    const status = db.tables.requests.getCell(requestId, 'status')
    if (status === 'preparing' || status === 'streaming') {
      failRequest(db, requestId, message)
    }
  }
}
