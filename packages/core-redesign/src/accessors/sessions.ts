import { DEFAULT_REQUEST_CONFIG, RequestConfig } from '#db'
import type { RequestConfig as RequestConfigType, Rows, TetraDb } from '#db'

import { createIdGenerator } from './ids'

export class SessionAccessors {
  private readonly db: TetraDb
  private readonly nextId = createIdGenerator('sess')

  constructor(db: TetraDb) {
    this.db = db
  }

  create(args: { config?: RequestConfigType; title?: string } = {}): string {
    const sessionId = this.nextId()
    const now = Date.now()

    this.db.store.setRow('sessions', sessionId, {
      config: args.config ?? DEFAULT_REQUEST_CONFIG,
      createdAt: now,
      title: args.title ?? '',
      updatedAt: now,
    })

    return sessionId
  }

  delete(sessionId: string): void {
    this.db.store.delRow('sessions', sessionId)
  }

  exists(sessionId: string): boolean {
    return this.db.store.hasRow('sessions', sessionId)
  }

  get(sessionId: string): Rows.Session {
    this.require(sessionId)

    const row = this.db.store.getRow('sessions', sessionId)
    return {
      config: this.getConfig(sessionId),
      createdAt: row.createdAt,
      id: sessionId,
      title: row.title,
      updatedAt: row.updatedAt,
    }
  }

  getConfig(sessionId: string): RequestConfigType {
    this.require(sessionId)

    const rawConfig = this.db.store.getCell('sessions', sessionId, 'config')
    const result = RequestConfig.safeParse(rawConfig)
    return result.success ? result.data : DEFAULT_REQUEST_CONFIG
  }

  ids(): string[] {
    return this.db.store.getRowIds('sessions')
  }

  list(): Rows.Session[] {
    return this.ids()
      .map((sessionId) => this.get(sessionId))
      .toSorted((a, b) => a.createdAt - b.createdAt)
  }

  require(sessionId: string): void {
    if (!this.exists(sessionId)) {
      throw new Error(`Session not found: ${sessionId}`)
    }
  }

  setConfig(sessionId: string, config: RequestConfigType): void {
    this.require(sessionId)

    this.db.store.setPartialRow('sessions', sessionId, {
      config: RequestConfig.parse(config),
      updatedAt: Date.now(),
    })
  }

  touch(sessionId: string): void {
    this.require(sessionId)
    this.db.store.setCell('sessions', sessionId, 'updatedAt', Date.now())
  }

  update(sessionId: string, patch: { config?: RequestConfigType; title?: string }): void {
    this.require(sessionId)

    this.db.store.setPartialRow('sessions', sessionId, {
      ...('config' in patch && { config: RequestConfig.parse(patch.config) }),
      ...('title' in patch && { title: patch.title ?? '' }),
      updatedAt: Date.now(),
    })
  }
}
