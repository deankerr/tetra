import type { LibraryRows as Rows } from '@tetra/stores/library'

import type { TranscriptMessageTree } from './message-tree.ts'

export class TranscriptThread {
  readonly leafMessageId: string
  readonly sessionId: string

  private readonly tree: TranscriptMessageTree

  constructor({
    leafMessageId,
    sessionId,
    tree,
  }: {
    leafMessageId: string
    sessionId: string
    tree: TranscriptMessageTree
  }) {
    this.leafMessageId = leafMessageId
    this.sessionId = sessionId
    this.tree = tree
  }

  leafMessage(): Rows['messages'] {
    return this.requireLeafMessage()
  }

  messages(): Rows['messages'][] {
    this.requireLeafMessage()
    return this.tree.listMessagePathMessages(this.leafMessageId)
  }

  private requireLeafMessage(): Rows['messages'] {
    const message = this.tree.requireMessage(this.leafMessageId)
    if (this.tree.listContinuations(this.leafMessageId).length > 0) {
      throw new Error(`Resolved thread is stale because ${this.leafMessageId} is no longer a leaf`)
    }

    return message
  }
}
