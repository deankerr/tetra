# Session Message Control Design

Current working design for Tetra's `Transcripts` module. ADRs in `docs/adr/` are the durable decision record; this note is the implementation-facing summary for the next vertical slice.

## Direction

`Transcripts` owns durable session and message control. It does not own runs, provider role projection, model execution, UI focus, or CLI continuation state.

Sessions contain messages. Messages form a tree through nullable `parentMessageId` links. A thread is a focused path view through that tree, not a stored row and not a subtree.

## Target Schema Shape

`sessions` keeps:

- `createdAt`
- `title`
- `updatedAt`

`messages` keeps:

- `createdAt`
- `parentMessageId: string | null`
- `parts`
- `role`
- `sessionId`
- `updatedAt`

Remove:

- `sessions.activeThreadId`
- `threads`
- `messages.position`

Add:

- `messagesBySession`

Ordering for derived transcript views uses `createdAt`, then `id`, unless a more specific semantic ordering field is introduced later.

## Handles

`Transcripts` should expose session handles:

```ts
const session = transcripts.getSession(sessionId)
```

Session handles mutate the message tree:

```ts
session.appendMessage({
  parentMessageId: null,
  parts,
  role,
})

session.editMessage(messageId, {
  parts,
  role,
})

session.deleteMessage(messageId)
```

Thread handles read and navigate:

```ts
const defaultThread = session.getThread()
const focusedThread = session.getThread({ messageId })

defaultThread.messages()
defaultThread.message()
defaultThread.children()
defaultThread.hasChildren()
```

`session.getThread()` resolves the default cursor at call time. The returned thread handle keeps that cursor fixed, while read methods can observe current store state when called.

## Thread Semantics

The default thread ends at the newest created leaf message in the session. If the session has no messages, the default thread has a `null` cursor, an empty path, and root-level messages as children.

`session.getThread({ messageId })` derives a thread ending exactly at that message. If the message has children, those children are navigation choices; they are not automatically part of the thread.

Session-scoped APIs fail fast if a supplied message id does not exist or belongs to another session.

## Current Flow Compatibility

The web and CLI submit flow remains caller-orchestrated:

```ts
const thread = session.getThread()
const parentMessageId = thread.message()?.id ?? null

const userMessage = session.appendMessage({
  parentMessageId,
  parts,
  role: 'user',
})

const targetMessage = session.appendMessage({
  parentMessageId: userMessage.id,
  parts: [],
  role: 'assistant',
})

runs.generate({ targetMessageId: targetMessage.id })
```

Add-only message creation appends a committed message without starting a run.

Regeneration creates a new sibling with the same parent as the message being regenerated, then calls `runs.generate` for that new target message. The original message and its descendants remain intact.

CLI `history` and the default web conversation render the derived default thread when no caller-owned focus is supplied.

## Runs Boundary

Runs stay outside Transcripts. `runs.generate({ targetMessageId })` assembles context from the thread ending at the target message's parent. The target message itself is never included in its own context.

Runs require the target message to have empty committed parts. That readiness check belongs to Runs, not Transcripts.

Provider-specific role projection also belongs at run/context assembly boundaries. Transcripts stores roles as caller-authored labels only.

## Provisional First Slice

`deleteMessage` is leaf-only at first and throws if the message has children. This is an implementation constraint, not an ADR-level product decision.

Export includes all messages in a session, not only the current/default thread.

Web may later store a local focused thread cursor in `webUiStore`. CLI may later store equivalent continuation/focus state in workspace state. Neither belongs on the synchronized `sessions` row.
