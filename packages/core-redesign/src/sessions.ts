import type { Accessors } from '#accessors'
import type { RequestConfig, Rows } from '#db'

export class Sessions {
  private readonly accessors: Accessors

  constructor(accessors: Accessors) {
    this.accessors = accessors
  }

  create(args: { config?: RequestConfig; title?: string } = {}): string {
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

  get(sessionId: string): Rows.Session {
    return this.accessors.sessions.get(sessionId)
  }

  getConfig(sessionId: string): RequestConfig {
    return this.accessors.sessions.getConfig(sessionId)
  }

  list(): Rows.Session[] {
    return this.accessors.sessions.list()
  }

  rename(sessionId: string, title: string): void {
    this.accessors.sessions.update(sessionId, { title })
  }

  setConfig(sessionId: string, config: RequestConfig): void {
    this.accessors.sessions.setConfig(sessionId, config)
  }

  touch(sessionId: string): void {
    this.accessors.sessions.touch(sessionId)
  }
}
