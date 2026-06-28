import type {
  LibraryStoreInstance,
  LibraryTypedIndexes,
  LibraryBoundStore,
  RunConfig,
} from '@tetra/schemas/library'

import { createIdGenerator } from '#ids'
import type { RunConfigs } from '#run-configs'

import { TranscriptSession } from './session.ts'

export class Transcripts {
  private readonly nextMessageId = createIdGenerator('msg')
  private readonly nextSessionId = createIdGenerator('sess')
  private readonly runConfigs: RunConfigs
  private readonly boundIndexes: LibraryTypedIndexes
  private readonly boundStore: LibraryBoundStore

  constructor({
    libraryStore,
    runConfigs,
  }: {
    libraryStore: LibraryStoreInstance
    runConfigs: RunConfigs
  }) {
    this.runConfigs = runConfigs
    this.boundIndexes = libraryStore.boundIndexes
    this.boundStore = libraryStore.boundStore
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
    this.boundStore.transaction(() => {
      this.boundStore.tables.sessions.setRow(sessionId, {
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
    this.boundStore.tables.sessions.requireEntity(sessionId)

    // Cascade session-owned rows before deleting the session row itself.
    this.boundStore.transaction(() => {
      for (const runId of this.boundIndexes.getSliceRowIds('runsBySessionNewestFirst', sessionId)) {
        this.boundStore.tables.runs.deleteRow(runId)
      }

      for (const stepId of this.boundIndexes.getSliceRowIds('stepsBySession', sessionId)) {
        this.boundStore.tables.steps.deleteRow(stepId)
      }

      for (const messageId of this.boundIndexes.getSliceRowIds('messagesBySession', sessionId)) {
        this.boundStore.tables.messages.deleteRow(messageId)
      }

      this.boundStore.tables.sessions.deleteRow(sessionId)
    })
  }

  getSession(sessionId: string): TranscriptSession {
    this.boundStore.tables.sessions.requireEntity(sessionId)

    // Session handles keep mutation calls scoped to one owning session.
    return new TranscriptSession({
      boundIndexes: this.boundIndexes,
      boundStore: this.boundStore,
      id: sessionId,
      nextMessageId: this.nextMessageId,
    })
  }
}
