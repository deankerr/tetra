import type { LibraryDb, RunConfig } from '@tetra/schemas/library'

import { createIdGenerator } from '#ids'
import type { RunConfigs } from '#run-configs'

import { TranscriptSession } from './session.ts'

export class Transcripts {
  private readonly nextMessageId = createIdGenerator('msg')
  private readonly nextSessionId = createIdGenerator('sess')
  private readonly runConfigs: RunConfigs
  private readonly library: LibraryDb

  constructor({ library, runConfigs }: { library: LibraryDb; runConfigs: RunConfigs }) {
    this.runConfigs = runConfigs
    this.library = library
  }

  createSession(
    args: {
      config?: Partial<RunConfig>
      onCreate?: (sessionId: string) => void
      title?: string
    } = {},
  ): string {
    const sessionId = this.nextSessionId()
    const now = Date.now()
    const config = this.runConfigs.createForSession(args.config)

    // Create an empty session; only real caller-created messages enter the transcript.
    // RunConfigs parses the birth merge before writing, so a bad config leaves nothing behind.
    this.library.batch(() => {
      this.library.sessions.create(sessionId, {
        config,
        createdAt: now,
        title: args.title ?? '',
        updatedAt: now,
      })
      args.onCreate?.(sessionId)
    })

    return sessionId
  }

  deleteSession(sessionId: string): void {
    this.library.sessions.require(sessionId)

    // Cascade session-owned rows before deleting the session row itself.
    this.library.batch(() => {
      for (const run of this.library.runs.bySessionNewestFirst(sessionId)) {
        this.library.runs.delete(run.id)
      }

      for (const step of this.library.steps.bySession(sessionId)) {
        this.library.steps.delete(step.id)
      }

      for (const message of this.library.messages.bySession(sessionId)) {
        this.library.messages.delete(message.id)
      }

      this.library.sessions.delete(sessionId)
    })
  }

  renameSession(args: { sessionId: string; title: string }): void {
    this.library.sessions.require(args.sessionId)
    const title = args.title.trim()
    if (title === '') {
      throw new Error('Title cannot be empty')
    }

    // Session title edits are activity-bearing metadata edits, so they touch updatedAt.
    this.library.sessions.update(args.sessionId, {
      title,
      updatedAt: Date.now(),
    })
  }

  getSession(sessionId: string): TranscriptSession {
    this.library.sessions.require(sessionId)

    // Session handles keep mutation calls scoped to one owning session.
    return new TranscriptSession({
      id: sessionId,
      library: this.library,
      nextMessageId: this.nextMessageId,
    })
  }
}
