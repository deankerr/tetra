import { RequestConfig, RequestStatus } from '#db'
import type {
  RequestConfig as RequestConfigType,
  RequestStatus as RequestStatusType,
  Rows,
  StepRecord,
  TetraDb,
} from '#db'

import { createIdGenerator } from './ids'

export class RequestAccessors {
  private readonly db: TetraDb
  private readonly nextId = createIdGenerator('req')

  constructor(db: TetraDb) {
    this.db = db
  }

  appendStep(requestId: string, step: StepRecord): void {
    const request = this.get(requestId)

    this.db.store.setCell('requests', requestId, 'steps', [...request.steps, step])
  }

  complete(requestId: string): void {
    this.updateStatus(requestId, { completedAt: Date.now(), status: 'completed' })
  }

  create(args: {
    assistantMessageId: string
    config: RequestConfigType
    sessionId: string
  }): string {
    const requestId = this.nextId()

    this.db.store.setRow('requests', requestId, {
      assistantMessageId: args.assistantMessageId,
      completedAt: 0,
      config: RequestConfig.parse(args.config),
      createdAt: Date.now(),
      errorMessage: '',
      sessionId: args.sessionId,
      status: 'streaming',
      steps: [],
    })

    return requestId
  }

  cancel(requestId: string, message = ''): void {
    this.updateStatus(requestId, {
      completedAt: Date.now(),
      errorMessage: message,
      status: 'cancelled',
    })
  }

  delete(requestId: string): void {
    this.db.store.delRow('requests', requestId)
  }

  fail(requestId: string, error: unknown): void {
    this.updateStatus(requestId, {
      completedAt: Date.now(),
      errorMessage: String(error),
      status: 'error',
    })
  }

  get(requestId: string): Rows.Request {
    if (!this.exists(requestId)) {
      throw new Error(`Request not found: ${requestId}`)
    }

    const row = this.db.store.getRow('requests', requestId)
    return {
      assistantMessageId: row.assistantMessageId,
      completedAt: row.completedAt,
      config: RequestConfig.parse(row.config),
      createdAt: row.createdAt,
      errorMessage: row.errorMessage,
      id: requestId,
      sessionId: row.sessionId,
      status: RequestStatus.parse(row.status),
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- StepRecord[] is stored verbatim in TinyBase's array cell.
      steps: row.steps as StepRecord[],
    }
  }

  idsForSession(sessionId: string): string[] {
    return this.db.indexes.getSliceRowIds('requestsBySession', sessionId)
  }

  recoverInterrupted(message = 'Request interrupted'): void {
    for (const requestId of this.ids()) {
      const request = this.get(requestId)
      if (request.status === 'streaming') {
        this.fail(requestId, message)
      }
    }
  }

  private ids(): string[] {
    return this.db.store.getRowIds('requests')
  }

  private exists(requestId: string): boolean {
    return this.db.store.hasRow('requests', requestId)
  }

  private updateStatus(
    requestId: string,
    patch: { completedAt: number; errorMessage?: string; status: RequestStatusType },
  ): void {
    this.get(requestId)

    this.db.store.setPartialRow('requests', requestId, {
      completedAt: patch.completedAt,
      errorMessage: patch.errorMessage ?? '',
      status: RequestStatus.parse(patch.status),
    })
  }
}
