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

export interface AppendMessageArgs {
  parentMessageId: string | null
  parts: UIMessage['parts']
  role: Rows['messages']['role']
}

export interface EditMessageArgs {
  parts?: UIMessage['parts']
  role?: Rows['messages']['role']
}

export interface GetThreadArgs {
  messageId?: string | null
}

export interface TranscriptSession {
  readonly id: string
  appendMessage(args: AppendMessageArgs): string
  deleteMessage(messageId: string): void
  editMessage(messageId: string, args: EditMessageArgs): void
  getThread(args?: GetThreadArgs): TranscriptThread
  listMessages(): Rows['messages'][]
}

export interface TranscriptThread {
  readonly messageId: string | null
  readonly sessionId: string
  children(): Rows['messages'][]
  hasChildren(): boolean
  message(): Rows['messages'] | null
  messages(): Rows['messages'][]
}

export class Transcripts {
  private readonly rawStore: TetraRawStore
  private readonly typedIndexes: TetraTypedIndexes
  private readonly typedStore: TetraTypedStore

  private readonly nextMessageId = createIdGenerator('msg')
  private readonly nextSessionId = createIdGenerator('sess')

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

  deleteMessage(messageId: string): void {
    const message = this.typedStore.tables.messages.requireEntity(messageId)
    this.deleteSessionMessage(message.sessionId, messageId)
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

  editMessage(sessionId: string, messageId: string, args: EditMessageArgs): void {
    this.requireSessionMessage(sessionId, messageId)
    const now = Date.now()
    const update: EditMessageArgs & { updatedAt: number } = { updatedAt: now }

    // Preserve parentage; edits only mutate caller-authored content and metadata in place.
    if ('parts' in args) {
      update.parts = args.parts
    }
    if ('role' in args) {
      update.role = args.role
    }

    // Touch the owning session so coarse activity ordering follows transcript edits.
    this.typedStore.transaction(() => {
      this.typedStore.tables.messages.updateRow(messageId, update)
      this.typedStore.tables.sessions.setCell(sessionId, 'updatedAt', now)
    })
  }

  exportSession(sessionId: string) {
    const session = this.typedStore.tables.sessions.requireEntity(sessionId)

    // Export every message in the session so forks and alternate continuations stay inspectable.
    return {
      exportedAt: new Date().toISOString(),
      messages: this.listSessionMessages(sessionId),
      runs: this.typedIndexes
        .getSliceRowIds('runsBySessionNewestFirst', sessionId)
        .map((id) => this.typedStore.tables.runs.requireEntity(id)),
      session,
      sessionRunConfig: this.typedStore.tables.sessionRunConfigs.requireEntity(sessionId),
      steps: this.typedIndexes
        .getSliceRowIds('stepsBySession', sessionId)
        .map((id) => this.typedStore.tables.steps.requireEntity(id)),
    }
  }

  getMessagesBefore(messageId: string): Rows['messages'][] {
    const message = this.typedStore.tables.messages.requireEntity(messageId)
    const session = this.getSession(message.sessionId)

    // Runs assemble context from the parent path; the target is never in its own prompt.
    return session.getThread({ messageId: message.parentMessageId }).messages()
  }

  getSession(sessionId: string): TranscriptSession {
    this.typedStore.tables.sessions.requireEntity(sessionId)

    // Session handles keep mutation calls scoped to one owning session.
    return {
      appendMessage: (args) => this.appendMessage(sessionId, args),
      deleteMessage: (messageId) => {
        this.deleteSessionMessage(sessionId, messageId)
      },
      editMessage: (messageId, args) => {
        this.editMessage(sessionId, messageId, args)
      },
      getThread: (args = {}) => this.getThread(sessionId, args),
      id: sessionId,
      listMessages: () => this.listSessionMessages(sessionId),
    }
  }

  listDefaultThreadMessages(sessionId: string): Rows['messages'][] {
    return this.getSession(sessionId).getThread().messages()
  }

  appendMessage(sessionId: string, args: AppendMessageArgs): string {
    this.typedStore.tables.sessions.requireEntity(sessionId)
    if (args.parentMessageId !== null) {
      this.requireSessionMessage(sessionId, args.parentMessageId)
    }

    const messageId = this.nextMessageId()
    const now = Date.now()

    // Persist caller-authored message content with explicit parentage.
    this.typedStore.transaction(() => {
      this.typedStore.tables.messages.setRow(messageId, {
        createdAt: now,
        parentMessageId: args.parentMessageId,
        parts: args.parts,
        role: args.role,
        sessionId,
        updatedAt: now,
      })
      this.typedStore.tables.sessions.setCell(sessionId, 'updatedAt', now)
    })

    return messageId
  }

  getThread(sessionId: string, args: GetThreadArgs = {}): TranscriptThread {
    this.typedStore.tables.sessions.requireEntity(sessionId)
    const messageId =
      'messageId' in args ? (args.messageId ?? null) : this.getDefaultThreadMessageId(sessionId)
    if (messageId !== null) {
      this.requireSessionMessage(sessionId, messageId)
    }

    // Thread handles read a fixed cursor while resolving fresh store rows on every call.
    return {
      children: () => this.listThreadChildren(sessionId, messageId),
      hasChildren: () => this.listThreadChildren(sessionId, messageId).length > 0,
      message: () => (messageId === null ? null : this.requireSessionMessage(sessionId, messageId)),
      messageId,
      messages: () => this.listThreadMessages(sessionId, messageId),
      sessionId,
    }
  }

  listSessionMessages(sessionId: string): Rows['messages'][] {
    this.typedStore.tables.sessions.requireEntity(sessionId)

    // Shape session messages in memory so thread semantics are independent of row ids.
    return this.typedIndexes
      .getSliceRowIds('messagesBySession', sessionId)
      .map((id) => this.typedStore.tables.messages.requireEntity(id))
      .toSorted(compareMessages)
  }

  listThreadChildren(sessionId: string, messageId: string | null): Rows['messages'][] {
    const messages = this.listSessionMessages(sessionId)

    // Children are direct continuations from the focused cursor, or roots for a null cursor.
    return messages.filter((message) => message.parentMessageId === messageId)
  }

  listThreadMessages(sessionId: string, messageId: string | null): Rows['messages'][] {
    this.typedStore.tables.sessions.requireEntity(sessionId)
    if (messageId === null) {
      return []
    }

    // Walk parent links upward, validating ownership and cycles before display order is returned.
    const path: Rows['messages'][] = []
    const seen = new Set<string>()
    let cursor: string | null = messageId
    while (cursor !== null) {
      if (seen.has(cursor)) {
        throw new Error(`Cycle detected in transcript path at message: ${cursor}`)
      }
      seen.add(cursor)

      const message = this.requireSessionMessage(sessionId, cursor)
      path.push(message)
      cursor = message.parentMessageId
    }

    return path.toReversed()
  }

  requireSessionMessage(sessionId: string, messageId: string): Rows['messages'] {
    const message = this.typedStore.tables.messages.requireEntity(messageId)
    if (message.sessionId !== sessionId) {
      throw new Error(`Message ${messageId} does not belong to session ${sessionId}`)
    }

    return message
  }

  deleteSessionMessage(sessionId: string, messageId: string): void {
    const message = this.requireSessionMessage(sessionId, messageId)
    const children = this.listThreadChildren(sessionId, messageId)
    if (children.length > 0) {
      throw new Error(`Cannot delete message with descendants: ${messageId}`)
    }

    const now = Date.now()

    // Remove run and step sidecars before dropping the target content row.
    this.typedStore.transaction(() => {
      for (const runId of this.typedIndexes.getSliceRowIds(
        'runsByTargetMessageNewestFirst',
        message.id,
      )) {
        for (const stepId of this.typedIndexes.getSliceRowIds('stepsByRun', runId)) {
          this.typedStore.tables.steps.deleteRow(stepId)
        }
        this.typedStore.tables.runs.deleteRow(runId)
      }

      for (const stepId of this.typedIndexes.getSliceRowIds('stepsByMessage', message.id)) {
        this.typedStore.tables.steps.deleteRow(stepId)
      }

      this.typedStore.tables.streamingMessageParts.deleteRow(message.id)
      this.typedStore.tables.messages.deleteRow(message.id)
      this.typedStore.tables.sessions.setCell(sessionId, 'updatedAt', now)
    })
  }

  private getDefaultThreadMessageId(sessionId: string): string | null {
    const messages = this.listSessionMessages(sessionId)
    if (messages.length === 0) {
      return null
    }

    // The default view follows the newest leaf, leaving older forks available as children.
    const parentIds = new Set(
      messages
        .map((message) => message.parentMessageId)
        .filter((parentMessageId): parentMessageId is string => parentMessageId !== null),
    )
    return messages.findLast((message) => !parentIds.has(message.id))?.id ?? null
  }
}

function compareMessages(left: Rows['messages'], right: Rows['messages']): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt
  }

  return left.id.localeCompare(right.id)
}

function toConfigObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value))
  }

  return {}
}
