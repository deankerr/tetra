import type { LibraryDb, LibraryEntities } from '@tetra/schemas/library'
import type { UIMessage } from 'ai'

import { TranscriptMessagePath } from './message-path.ts'
import { TranscriptMessageTree } from './message-tree.ts'
import { TranscriptThread } from './thread.ts'

const INFERRED_SESSION_TITLE_TEXT_LENGTH = 200

export class TranscriptSession {
  readonly id: string

  private readonly nextMessageId: () => string
  private readonly library: LibraryDb
  private readonly tree: TranscriptMessageTree

  constructor({
    id,
    nextMessageId,
    library,
  }: {
    id: string
    nextMessageId: () => string
    library: LibraryDb
  }) {
    this.id = id
    this.nextMessageId = nextMessageId
    this.library = library
    this.tree = new TranscriptMessageTree({ library, sessionId: id })
  }

  appendMessage(args: {
    parentMessageId: string | null
    parts: UIMessage['parts']
    role: LibraryEntities['messages']['role']
  }): string {
    const session = this.library.sessions.require(this.id)
    if (args.parentMessageId !== null) {
      this.tree.requireMessage(args.parentMessageId)
    }

    const messageId = this.nextMessageId()
    const now = Date.now()
    const inferredTitle = getInferredTitle({ parts: args.parts, role: args.role, session })

    // Persist caller-authored message content with explicit parentage.
    this.library.batch(() => {
      this.library.messages.create(messageId, {
        createdAt: now,
        parentMessageId: args.parentMessageId,
        parts: args.parts,
        role: args.role,
        sessionId: this.id,
        updatedAt: now,
      })
      if (inferredTitle === null) {
        this.library.sessions.update(this.id, { updatedAt: now })
        return
      }

      this.library.sessions.update(this.id, {
        title: inferredTitle,
        updatedAt: now,
      })
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
    this.library.batch(() => {
      for (const run of this.library.runs.byTargetMessageNewestFirst(message.id)) {
        for (const step of this.library.steps.byRun(run.id)) {
          this.library.steps.delete(step.id)
        }
        this.library.runs.delete(run.id)
      }

      for (const step of this.library.steps.byMessage(message.id)) {
        this.library.steps.delete(step.id)
      }

      this.library.messages.delete(message.id)
      this.library.sessions.update(this.id, { updatedAt: now })
    })
  }

  editMessage(
    messageId: string,
    args: {
      parts?: UIMessage['parts']
      role?: LibraryEntities['messages']['role']
    },
  ): void {
    this.tree.requireMessage(messageId)
    const now = Date.now()
    const update: {
      parts?: UIMessage['parts']
      role?: LibraryEntities['messages']['role']
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
    this.library.batch(() => {
      this.library.messages.update(messageId, update)
      this.library.sessions.update(this.id, { updatedAt: now })
    })
  }

  export() {
    const session = this.library.sessions.require(this.id)

    // Export every message in the session so forks and alternate continuations stay inspectable.
    return {
      exportedAt: new Date().toISOString(),
      messages: this.listMessages(),
      runs: this.library.runs.bySessionNewestFirst(this.id),
      session,
      steps: this.library.steps.bySession(this.id),
    }
  }

  getMessagePath(args: { messageId: string | null }): TranscriptMessagePath {
    this.library.sessions.require(this.id)
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

  listContinuations(messageId: string | null): LibraryEntities['messages'][] {
    return this.tree.listContinuations(messageId)
  }

  listMessages(): LibraryEntities['messages'][] {
    return this.tree.listMessages()
  }

  resolveThread(args: { fromMessageId: string }): TranscriptThread {
    this.library.sessions.require(this.id)
    const leafMessageId = this.tree.getNewestLeafMessageIdUnder(args.fromMessageId)

    // Resolved threads are continuable root-to-leaf paths from an explicit message anchor.
    return new TranscriptThread({ leafMessageId, sessionId: this.id, tree: this.tree })
  }
}

function getInferredTitle({
  parts,
  role,
  session,
}: {
  parts: UIMessage['parts']
  role: LibraryEntities['messages']['role']
  session: LibraryEntities['sessions']
}): string | null {
  if (session.title.trim() !== '' || role !== 'user') {
    return null
  }

  // Prefer the user's first text part; fall back to a coarse attachment title.
  for (const part of parts) {
    if (part.type !== 'text') {
      continue
    }

    const text = part.text.trim()
    const title =
      text.length > INFERRED_SESSION_TITLE_TEXT_LENGTH
        ? `${text.slice(0, INFERRED_SESSION_TITLE_TEXT_LENGTH)}...`
        : text
    if (title !== '') {
      return title
    }
  }

  for (const part of parts) {
    if (part.type === 'file' && part.mediaType.startsWith('image/')) {
      return 'Image'
    }
  }

  if (parts.some((part) => part.type !== 'text')) {
    return 'Attachment'
  }

  return null
}
