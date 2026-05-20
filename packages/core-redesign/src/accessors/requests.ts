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
    this.updateStatus(requestId, { status: 'completed', terminalAt: Date.now() })
  }

  create(args: {
    assistantMessageId: string
    config: RequestConfigType
    sessionId: string
  }): string {
    const requestId = this.nextId()

    this.db.store.setRow('requests', requestId, {
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

  cancel(requestId: string, message = ''): void {
    this.updateStatus(requestId, {
      errorMessage: message,
      status: 'cancelled',
      terminalAt: Date.now(),
    })
  }

  delete(requestId: string): void {
    this.db.store.delRow('requests', requestId)
  }

  fail(requestId: string, error: unknown): void {
    this.updateStatus(requestId, {
      errorMessage: String(error),
      status: 'error',
      terminalAt: Date.now(),
    })
  }

  get(requestId: string): Rows.Request {
    if (!this.exists(requestId)) {
      throw new Error(`Request not found: ${requestId}`)
    }

    const row = this.db.store.getRow('requests', requestId)
    return {
      assistantMessageId: row.assistantMessageId,
      config: RequestConfig.parse(row.config),
      createdAt: row.createdAt,
      errorMessage: row.errorMessage,
      id: requestId,
      sessionId: row.sessionId,
      status: RequestStatus.parse(row.status),
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- StepRecord[] is stored verbatim in TinyBase's array cell.
      steps: row.steps as StepRecord[],
      terminalAt: row.terminalAt,
    }
  }

  idsForSession(sessionId: string): string[] {
    return this.db.indexes.getSliceRowIds('requestsBySession', sessionId)
  }

  recoverInterrupted(message = 'Request interrupted'): void {
    for (const requestId of this.ids()) {
      const request = this.get(requestId)
      if (request.status === 'preparing' || request.status === 'streaming') {
        this.fail(requestId, message)
      }
    }
  }

  startStreaming(requestId: string): void {
    this.get(requestId)
    this.db.store.setPartialRow('requests', requestId, {
      errorMessage: '',
      status: RequestStatus.parse('streaming'),
    })
  }

  private ids(): string[] {
    return this.db.store.getRowIds('requests')
  }

  private exists(requestId: string): boolean {
    return this.db.store.hasRow('requests', requestId)
  }

  private updateStatus(
    requestId: string,
    patch: { errorMessage?: string; status: RequestStatusType; terminalAt: number },
  ): void {
    this.get(requestId)

    this.db.store.setPartialRow('requests', requestId, {
      errorMessage: patch.errorMessage ?? '',
      status: RequestStatus.parse(patch.status),
      terminalAt: patch.terminalAt,
    })
  }
}
