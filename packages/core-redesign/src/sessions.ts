import type { Accessors } from '#accessors'
import { RequestConfig, RequestStatus } from '#db'
import type { RequestConfig as RequestConfigType, Rows } from '#db'

export interface SessionExport {
  exportedAt: string
  messages: Rows.Message[]
  requests: Rows.Request[]
  session: Rows.Session
}

export class Sessions {
  private readonly accessors: Accessors

  constructor(accessors: Accessors) {
    this.accessors = accessors
  }

  create(args: { config?: RequestConfigType; title?: string } = {}): string {
    return this.accessors.sessions.create(args)
  }

  delete(sessionId: string): void {
    this.accessors.sessions.require(sessionId)

    this.accessors.transaction(() => {
      for (const messageId of this.accessors.messages.idsForSession(sessionId)) {
        this.accessors.messages.delete(messageId)
      }

      for (const requestId of this.accessors.requests.idsForSession(sessionId)) {
        this.accessors.requests.delete(requestId)
      }

      this.accessors.sessions.delete(sessionId)
    })
  }

  exists(sessionId: string): boolean {
    return this.accessors.sessions.exists(sessionId)
  }

  exportSession(sessionId: string): SessionExport {
    this.accessors.sessions.require(sessionId)

    return {
      exportedAt: new Date().toISOString(),
      messages: this.accessors.messages.listForSession(sessionId),
      requests: this.accessors.requests
        .idsForSession(sessionId)
        .map((requestId) => this.accessors.requests.get(requestId)),
      session: this.accessors.sessions.get(sessionId),
    }
  }

  get(sessionId: string): Rows.Session {
    return this.accessors.sessions.get(sessionId)
  }

  getConfig(sessionId: string): RequestConfigType {
    return this.accessors.sessions.getConfig(sessionId)
  }

  importSession({ messages, requests, session }: SessionExport): string {
    this.accessors.transaction(() => {
      this.accessors.db.store.setRow('sessions', session.id, {
        config: RequestConfig.parse(session.config),
        createdAt: session.createdAt,
        title: session.title,
        updatedAt: session.updatedAt,
      })

      for (const message of messages) {
        this.accessors.db.store.setRow('messages', message.id, {
          createdAt: message.createdAt,
          parts: message.parts,
          role: message.role,
          sessionId: message.sessionId,
          updatedAt: message.updatedAt,
        })
      }

      for (const request of requests) {
        this.accessors.db.store.setRow('requests', request.id, {
          assistantMessageId: request.assistantMessageId,
          config: RequestConfig.parse(request.config),
          createdAt: request.createdAt,
          errorMessage: request.errorMessage,
          sessionId: request.sessionId,
          status: RequestStatus.parse(request.status),
          steps: request.steps,
          terminalAt: request.terminalAt,
        })
      }
    })

    return session.id
  }

  list(): Rows.Session[] {
    return this.accessors.sessions.list()
  }

  rename(sessionId: string, title: string): void {
    this.accessors.sessions.update(sessionId, { title })
  }

  setConfig(sessionId: string, config: RequestConfigType): void {
    this.accessors.sessions.setConfig(sessionId, config)
  }

  touch(sessionId: string): void {
    this.accessors.sessions.touch(sessionId)
  }
}
