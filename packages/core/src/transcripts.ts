import { DEFAULT_RUN_CONFIG, RunConfigSchema } from '@tetra/store-schema'
import type {
  Rows,
  RunConfig,
  TetraRawStore,
  TetraTypedIndexes,
  TetraTypedStore,
} from '@tetra/store-schema'
import type { UIMessage } from 'ai'

import { createIdGenerator } from '#ids'

export interface CreateMessageArgs {
  parts: UIMessage['parts']
  role: Rows['messages']['role']
  sessionId: string
  threadId?: string
}

export class Transcripts {
  private readonly rawStore: TetraRawStore
  private readonly typedIndexes: TetraTypedIndexes
  private readonly typedStore: TetraTypedStore

  private readonly nextMessageId = createIdGenerator('msg')
  private readonly nextSessionId = createIdGenerator('sess')
  private readonly nextThreadId = createIdGenerator('thr')

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
    const threadId = this.nextThreadId()
    const storedDefaultConfig = this.rawStore.hasValue('defaultRunConfig')
      ? this.rawStore.getValue('defaultRunConfig')
      : DEFAULT_RUN_CONFIG
    const config = RunConfigSchema.parse({
      ...toConfigObject(storedDefaultConfig),
      ...args.config,
    })
    const now = Date.now()

    // Create the session and its first thread as one durable transcript shape.
    this.typedStore.transaction(() => {
      this.typedStore.tables.sessions.setRow(sessionId, {
        activeThreadId: threadId,
        createdAt: now,
        title: args.title ?? '',
        updatedAt: now,
      })
      this.typedStore.tables.threads.setRow(threadId, {
        createdAt: now,
        sessionId,
        updatedAt: now,
      })
      this.typedStore.tables.sessionRunConfigs.setRow(sessionId, config)
    })

    return sessionId
  }

  createThread(sessionId: string): string {
    this.typedStore.tables.sessions.requireEntity(sessionId)
    const threadId = this.nextThreadId()
    const now = Date.now()

    // Threads are intentionally minimal until real switching and naming pressure appears.
    this.typedStore.tables.threads.setRow(threadId, {
      createdAt: now,
      sessionId,
      updatedAt: now,
    })

    return threadId
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

      for (const threadId of this.typedIndexes.getSliceRowIds('threadsBySession', sessionId)) {
        for (const messageId of this.typedIndexes.getSliceRowIds('messagesByThread', threadId)) {
          this.typedStore.tables.messages.deleteRow(messageId)
        }
        this.typedStore.tables.threads.deleteRow(threadId)
      }

      this.typedStore.tables.sessionRunConfigs.deleteRow(sessionId)
      this.typedStore.tables.sessions.deleteRow(sessionId)
    })
  }

  appendMessage(
    sessionId: string,
    args: { parts: UIMessage['parts']; role: Rows['messages']['role']; threadId?: string },
  ): string {
    return this.createMessage({ ...args, sessionId })
  }

  createMessage(args: CreateMessageArgs): string {
    const session = this.typedStore.tables.sessions.requireEntity(args.sessionId)
    const threadId = args.threadId ?? session.activeThreadId
    const thread = this.typedStore.tables.threads.requireEntity(threadId)
    if (thread.sessionId !== args.sessionId) {
      throw new Error(`Thread ${threadId} does not belong to session ${args.sessionId}`)
    }

    const messageId = this.nextMessageId()
    const now = Date.now()
    const position = this.nextMessagePosition(threadId)

    // Persist caller-authored message content at the next position in the chosen thread.
    this.typedStore.transaction(() => {
      this.typedStore.tables.messages.setRow(messageId, {
        createdAt: now,
        parts: args.parts,
        position,
        role: args.role,
        threadId,
        updatedAt: now,
      })
      this.typedStore.tables.threads.setCell(threadId, 'updatedAt', now)
      this.typedStore.tables.sessions.setCell(args.sessionId, 'updatedAt', now)
    })

    return messageId
  }

  deleteMessage(messageId: string): void {
    const message = this.typedStore.tables.messages.requireEntity(messageId)
    const thread = this.typedStore.tables.threads.requireEntity(message.threadId)
    const now = Date.now()

    // Remove run and step sidecars before dropping the target content row.
    this.typedStore.transaction(() => {
      for (const runId of this.typedIndexes.getSliceRowIds(
        'runsByTargetMessageNewestFirst',
        messageId,
      )) {
        for (const stepId of this.typedIndexes.getSliceRowIds('stepsByRun', runId)) {
          this.typedStore.tables.steps.deleteRow(stepId)
        }
        this.typedStore.tables.runs.deleteRow(runId)
      }

      for (const stepId of this.typedIndexes.getSliceRowIds('stepsByMessage', messageId)) {
        this.typedStore.tables.steps.deleteRow(stepId)
      }

      this.typedStore.tables.streamingMessageParts.deleteRow(messageId)
      this.typedStore.tables.messages.deleteRow(messageId)
      this.typedStore.tables.threads.setCell(message.threadId, 'updatedAt', now)
      this.typedStore.tables.sessions.setCell(thread.sessionId, 'updatedAt', now)
    })
  }

  exportSession(sessionId: string) {
    const session = this.typedStore.tables.sessions.requireEntity(sessionId)
    const threads = this.listThreads(sessionId)

    // Export messages in thread order so the JSON remains easy to inspect during the spike.
    return {
      exportedAt: new Date().toISOString(),
      messages: threads.flatMap((thread) => this.listThreadMessages(thread.id)),
      runs: this.typedIndexes
        .getSliceRowIds('runsBySessionNewestFirst', sessionId)
        .map((id) => this.typedStore.tables.runs.requireEntity(id)),
      session,
      sessionRunConfig: this.typedStore.tables.sessionRunConfigs.requireEntity(sessionId),
      steps: this.typedIndexes
        .getSliceRowIds('stepsBySession', sessionId)
        .map((id) => this.typedStore.tables.steps.requireEntity(id)),
      threads,
    }
  }

  getMessagesBefore(messageId: string): Rows['messages'][] {
    const message = this.typedStore.tables.messages.requireEntity(messageId)
    const messages = this.listThreadMessages(message.threadId)
    const targetIndex = messages.findIndex((candidate) => candidate.id === messageId)
    if (targetIndex === -1) {
      throw new Error(`Message not found in thread transcript: ${messageId}`)
    }

    // Return the ordered prefix before the target message for run context assembly.
    return messages.slice(0, targetIndex)
  }

  listActiveThreadMessages(sessionId: string): Rows['messages'][] {
    const session = this.typedStore.tables.sessions.requireEntity(sessionId)
    return this.listThreadMessages(session.activeThreadId)
  }

  listThreadMessages(threadId: string): Rows['messages'][] {
    this.typedStore.tables.threads.requireEntity(threadId)

    // The messagesByThread index is the transcript order for this spike.
    return this.typedIndexes
      .getSliceRowIds('messagesByThread', threadId)
      .map((id) => this.typedStore.tables.messages.requireEntity(id))
  }

  listThreads(sessionId: string): Rows['threads'][] {
    this.typedStore.tables.sessions.requireEntity(sessionId)

    // Session-owned threads are sorted by creation time for deterministic inspection.
    return this.typedIndexes
      .getSliceRowIds('threadsBySession', sessionId)
      .map((id) => this.typedStore.tables.threads.requireEntity(id))
  }

  private nextMessagePosition(threadId: string): number {
    const lastMessageId = this.typedIndexes.getSliceRowIds('messagesByThread', threadId).at(-1)
    if (lastMessageId === undefined) {
      return 1
    }

    const lastPosition = this.typedStore.tables.messages.requireEntity(lastMessageId).position
    return lastPosition + 1
  }
}

function toConfigObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value))
  }

  return {}
}
