import type { LibraryTypedIndexes, LibraryTypedStore, RunConfig } from '@tetra/stores/library'

import { createIdGenerator } from '#ids'
import type { RunConfigs } from '#run-configs'

import { TranscriptSession } from './session.ts'

export class Transcripts {
  private readonly nextMessageId = createIdGenerator('msg')
  private readonly nextSessionId = createIdGenerator('sess')
  private readonly runConfigs: RunConfigs
  private readonly typedIndexes: LibraryTypedIndexes
  private readonly typedStore: LibraryTypedStore

  constructor({
    runConfigs,
    typedIndexes,
    typedStore,
  }: {
    runConfigs: RunConfigs
    typedIndexes: LibraryTypedIndexes
    typedStore: LibraryTypedStore
  }) {
    this.runConfigs = runConfigs
    this.typedIndexes = typedIndexes
    this.typedStore = typedStore
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

    // Create an empty session; only real caller-created messages enter the transcript.
    // RunConfigs parses the birth merge before writing, so it runs first and a bad
    // config leaves nothing behind. The nested transaction keeps session+config atomic.
    this.typedStore.transaction(() => {
      this.runConfigs.createForSession(sessionId, args.config)
      this.typedStore.tables.sessions.setRow(sessionId, {
        createdAt: now,
        title: args.title ?? '',
        updatedAt: now,
      })
      args.onCreate?.(sessionId)
    })

    return sessionId
  }

  deleteSession(sessionId: string): void {
    this.typedStore.tables.sessions.requireEntity(sessionId)

    // Cascade session-owned rows before deleting the session row itself.
    this.typedStore.transaction(() => {
      for (const runId of this.typedIndexes.getSliceRowIds('runsBySessionNewestFirst', sessionId)) {
        this.typedStore.tables.runs.deleteRow(runId)
      }

      for (const stepId of this.typedIndexes.getSliceRowIds('stepsBySession', sessionId)) {
        this.typedStore.tables.steps.deleteRow(stepId)
      }

      for (const messageId of this.typedIndexes.getSliceRowIds('messagesBySession', sessionId)) {
        this.typedStore.tables.messages.deleteRow(messageId)
      }

      this.runConfigs.deleteForSession(sessionId)
      this.typedStore.tables.sessions.deleteRow(sessionId)
    })
  }

  getSession(sessionId: string): TranscriptSession {
    this.typedStore.tables.sessions.requireEntity(sessionId)

    // Session handles keep mutation calls scoped to one owning session.
    return new TranscriptSession({
      id: sessionId,
      nextMessageId: this.nextMessageId,
      typedIndexes: this.typedIndexes,
      typedStore: this.typedStore,
    })
  }
}
