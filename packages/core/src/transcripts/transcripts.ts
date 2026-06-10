import { DEFAULT_RUN_CONFIG, RunConfigSchema } from '@tetra/store-schema'
import type {
  RunConfig,
  TetraRawStore,
  TetraTypedIndexes,
  TetraTypedStore,
} from '@tetra/store-schema'

import { createIdGenerator } from '#ids'

import { TranscriptSession } from './session.ts'

export class Transcripts {
  private readonly nextMessageId = createIdGenerator('msg')
  private readonly nextSessionId = createIdGenerator('sess')
  private readonly rawStore: TetraRawStore
  private readonly typedIndexes: TetraTypedIndexes
  private readonly typedStore: TetraTypedStore

  constructor({
    rawStore,
    typedIndexes,
    typedStore,
  }: {
    rawStore: TetraRawStore
    typedIndexes: TetraTypedIndexes
    typedStore: TetraTypedStore
  }) {
    this.rawStore = rawStore
    this.typedIndexes = typedIndexes
    this.typedStore = typedStore
  }

  createSession(args: { config?: Partial<RunConfig>; title?: string } = {}): string {
    const sessionId = this.nextSessionId()
    const storedDefaultConfig = this.rawStore.hasValue('defaultRunConfig')
      ? this.rawStore.getValue('defaultRunConfig')
      : DEFAULT_RUN_CONFIG
    const config = RunConfigSchema.parse({
      ...toConfigObject(storedDefaultConfig),
      ...args.config,
    })
    const now = Date.now()

    // Create an empty session; only real caller-created messages enter the transcript.
    this.typedStore.transaction(() => {
      this.typedStore.tables.sessions.setRow(sessionId, {
        createdAt: now,
        title: args.title ?? '',
        updatedAt: now,
      })
      this.typedStore.tables.sessionRunConfigs.setRow(sessionId, config)
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

      for (const messageId of this.typedIndexes.getSliceRowIds(
        'streamingPartsBySession',
        sessionId,
      )) {
        this.typedStore.tables.streamingMessageParts.deleteRow(messageId)
      }

      for (const stepId of this.typedIndexes.getSliceRowIds('stepsBySession', sessionId)) {
        this.typedStore.tables.steps.deleteRow(stepId)
      }

      for (const messageId of this.typedIndexes.getSliceRowIds('messagesBySession', sessionId)) {
        this.typedStore.tables.messages.deleteRow(messageId)
      }

      this.typedStore.tables.sessionRunConfigs.deleteRow(sessionId)
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

function toConfigObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value))
  }

  return {}
}
