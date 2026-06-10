import type { Rows, TetraTypedIndexes, TetraTypedStore } from '@tetra/store-schema'
import type { UIMessage } from 'ai'

import { TranscriptMessagePath } from './message-path.ts'
import { TranscriptMessageTree } from './message-tree.ts'
import { TranscriptThread } from './thread.ts'

export class TranscriptSession {
  readonly id: string

  private readonly nextMessageId: () => string
  private readonly typedIndexes: TetraTypedIndexes
  private readonly typedStore: TetraTypedStore
  private readonly tree: TranscriptMessageTree

  constructor({
    id,
    nextMessageId,
    typedIndexes,
    typedStore,
  }: {
    id: string
    nextMessageId: () => string
    typedIndexes: TetraTypedIndexes
    typedStore: TetraTypedStore
  }) {
    this.id = id
    this.nextMessageId = nextMessageId
    this.typedIndexes = typedIndexes
    this.typedStore = typedStore
    this.tree = new TranscriptMessageTree({ sessionId: id, typedIndexes, typedStore })
  }

  appendMessage(args: {
    parentMessageId: string | null
    parts: UIMessage['parts']
    role: Rows['messages']['role']
  }): string {
    this.typedStore.tables.sessions.requireEntity(this.id)
    if (args.parentMessageId !== null) {
      this.tree.requireMessage(args.parentMessageId)
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
        sessionId: this.id,
        updatedAt: now,
      })
      this.typedStore.tables.sessions.setCell(this.id, 'updatedAt', now)
    })

    return messageId
  }

  deleteMessage(messageId: string): void {
    const message = this.tree.requireMessage(messageId)
    const continuations = this.tree.listContinuations(messageId)
    if (continuations.length > 0) {
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
      this.typedStore.tables.sessions.setCell(this.id, 'updatedAt', now)
    })
  }

  editMessage(
    messageId: string,
    args: {
      parts?: UIMessage['parts']
      role?: Rows['messages']['role']
    },
  ): void {
    this.tree.requireMessage(messageId)
    const now = Date.now()
    const update: {
      parts?: UIMessage['parts']
      role?: Rows['messages']['role']
      updatedAt: number
    } = { updatedAt: now }

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
      this.typedStore.tables.sessions.setCell(this.id, 'updatedAt', now)
    })
  }

  export() {
    const session = this.typedStore.tables.sessions.requireEntity(this.id)

    // Export every message in the session so forks and alternate continuations stay inspectable.
    return {
      exportedAt: new Date().toISOString(),
      messages: this.listMessages(),
      runs: this.typedIndexes
        .getSliceRowIds('runsBySessionNewestFirst', this.id)
        .map((id) => this.typedStore.tables.runs.requireEntity(id)),
      session,
      sessionRunConfig: this.typedStore.tables.sessionRunConfigs.requireEntity(this.id),
      steps: this.typedIndexes
        .getSliceRowIds('stepsBySession', this.id)
        .map((id) => this.typedStore.tables.steps.requireEntity(id)),
    }
  }

  getMessagePath(args: { messageId: string | null }): TranscriptMessagePath {
    this.typedStore.tables.sessions.requireEntity(this.id)
    const { messageId } = args
    if (messageId !== null) {
      this.tree.requireMessage(messageId)
    }

    // Message path handles keep an exact cursor while resolving fresh store rows on read.
    return new TranscriptMessagePath({ messageId, sessionId: this.id, tree: this.tree })
  }

  getNewestLeafMessageId(): string | null {
    return this.tree.getNewestLeafMessageId()
  }

  listContinuations(messageId: string | null): Rows['messages'][] {
    return this.tree.listContinuations(messageId)
  }

  listMessages(): Rows['messages'][] {
    return this.tree.listMessages()
  }

  resolveThread(args: { fromMessageId: string }): TranscriptThread {
    this.typedStore.tables.sessions.requireEntity(this.id)
    const leafMessageId = this.tree.getNewestLeafMessageIdUnder(args.fromMessageId)

    // Resolved threads are continuable root-to-leaf paths from an explicit message anchor.
    return new TranscriptThread({ leafMessageId, sessionId: this.id, tree: this.tree })
  }
}
