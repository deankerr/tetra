import { RequestConfig, createIdGenerator } from '#db'
import type { RequestConfig as RequestConfigType, StepRecord, TetraDb } from '#db'

const nextId = createIdGenerator('req')

function getSteps(db: TetraDb, requestId: string): StepRecord[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- StepRecord[] stored verbatim in TinyBase array cell.
  return db.store.getCell('requests', requestId, 'steps') as StepRecord[]
}

export function createRequest(
  db: TetraDb,
  args: { assistantMessageId: string; config: RequestConfigType; sessionId: string },
): string {
  const requestId = nextId()

  db.store.setRow('requests', requestId, {
    assistantMessageId: args.assistantMessageId,
    config: RequestConfig.parse(args.config),
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
  db.store.setPartialRow('requests', requestId, { errorMessage: '', status: 'streaming' })
}

export function completeRequest(db: TetraDb, requestId: string): void {
  db.store.setPartialRow('requests', requestId, { status: 'completed', terminalAt: Date.now() })
}

export function cancelRequest(db: TetraDb, requestId: string, message = ''): void {
  db.store.setPartialRow('requests', requestId, {
    errorMessage: message,
    status: 'cancelled',
    terminalAt: Date.now(),
  })
}

export function failRequest(db: TetraDb, requestId: string, error: unknown): void {
  db.store.setPartialRow('requests', requestId, {
    errorMessage: String(error),
    status: 'error',
    terminalAt: Date.now(),
  })
}

export function appendStep(db: TetraDb, requestId: string, step: StepRecord): void {
  const steps = getSteps(db, requestId)
  db.store.setCell('requests', requestId, 'steps', [...steps, step])
}

export function recoverInterrupted(db: TetraDb, message = 'Request interrupted'): void {
  for (const requestId of db.store.getRowIds('requests')) {
    const status = db.store.getCell('requests', requestId, 'status')
    if (status === 'preparing' || status === 'streaming') {
      failRequest(db, requestId, message)
    }
  }
}
