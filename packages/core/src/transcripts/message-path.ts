import type { LibraryRows as Rows } from '@tetra/stores'

import type { TranscriptMessageTree } from './message-tree.ts'

export class TranscriptMessagePath {
  readonly messageId: string | null
  readonly sessionId: string

  private readonly tree: TranscriptMessageTree

  constructor({
    messageId,
    sessionId,
    tree,
  }: {
    messageId: string | null
    sessionId: string
    tree: TranscriptMessageTree
  }) {
    this.messageId = messageId
    this.sessionId = sessionId
    this.tree = tree
  }

  message(): Rows['messages'] | null {
    if (this.messageId === null) {
      return null
    }

    return this.tree.requireMessage(this.messageId)
  }

  messages(): Rows['messages'][] {
    return this.tree.listMessagePathMessages(this.messageId)
  }
}
