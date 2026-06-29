import type { LibraryDb, LibraryEntities } from '@tetra/schemas/library'

export class TranscriptMessageTree {
  readonly sessionId: string

  private readonly library: LibraryDb

  constructor({ sessionId, library }: { sessionId: string; library: LibraryDb }) {
    this.sessionId = sessionId
    this.library = library
  }

  getNewestLeafMessageId(): string | null {
    const messages = this.listMessages()
    if (messages.length === 0) {
      return null
    }

    // Surfaces can initialize a thread anchor from the newest leaf without storing it on sessions.
    const parentIds = getParentIds(messages)
    const leaf = messages.findLast((message) => !parentIds.has(message.id))
    if (!leaf) {
      throw new Error(
        `Cannot determine newest leaf for session ${this.sessionId}: no leaf message found`,
      )
    }

    return leaf.id
  }

  getNewestLeafMessageIdUnder(fromMessageId: string): string {
    const messages = this.listMessages()
    this.requireMessage(fromMessageId)

    // Walk downward from the anchor so upstream fork selection still resolves a thread.
    const descendantIds = new Set([fromMessageId])
    let addedDescendant = true
    while (addedDescendant) {
      addedDescendant = false
      for (const message of messages) {
        if (message.parentMessageId === null || !descendantIds.has(message.parentMessageId)) {
          continue
        }

        if (descendantIds.has(message.id)) {
          continue
        }

        descendantIds.add(message.id)
        addedDescendant = true
      }
    }

    // Pick the newest leaf inside that subtree; corrupted cyclic subtrees fail loudly.
    const parentIds = getParentIds(messages)
    const leaf = messages.findLast(
      (message) => descendantIds.has(message.id) && !parentIds.has(message.id),
    )
    if (!leaf) {
      throw new Error(
        `Cannot resolve thread from message ${fromMessageId}: no descendant leaf found`,
      )
    }

    return leaf.id
  }

  listContinuations(messageId: string | null): LibraryEntities['messages'][] {
    if (messageId !== null) {
      this.requireMessage(messageId)
    }
    const messages = this.listMessages()

    // Continuations are direct children from the chosen message, or roots for a null parent.
    return messages.filter((message) => message.parentMessageId === messageId)
  }

  listMessagePathMessages(messageId: string | null): LibraryEntities['messages'][] {
    this.library.sessions.require(this.sessionId)
    if (messageId === null) {
      return []
    }

    // Walk parent links upward, validating ownership and cycles before display order is returned.
    const path: LibraryEntities['messages'][] = []
    const seen = new Set<string>()
    let cursor: string | null = messageId
    while (cursor !== null) {
      if (seen.has(cursor)) {
        throw new Error(`Cycle detected in transcript path at message: ${cursor}`)
      }
      seen.add(cursor)

      const message = this.requireMessage(cursor)
      path.push(message)
      cursor = message.parentMessageId
    }

    return path.toReversed()
  }

  listMessages(): LibraryEntities['messages'][] {
    this.library.sessions.require(this.sessionId)

    // Shape session messages in memory so path semantics are independent of row ids.
    return this.library.messages.bySession(this.sessionId).toSorted(compareMessages)
  }

  requireMessage(messageId: string): LibraryEntities['messages'] {
    const message = this.library.messages.require(messageId)
    if (message.sessionId !== this.sessionId) {
      throw new Error(`Message ${messageId} does not belong to session ${this.sessionId}`)
    }

    return message
  }
}

function compareMessages(
  left: LibraryEntities['messages'],
  right: LibraryEntities['messages'],
): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt
  }

  return left.id.localeCompare(right.id)
}

function getParentIds(messages: LibraryEntities['messages'][]): Set<string> {
  return new Set(
    messages
      .map((message) => message.parentMessageId)
      .filter((parentMessageId): parentMessageId is string => parentMessageId !== null),
  )
}
