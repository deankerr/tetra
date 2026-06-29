import { expect, test } from 'bun:test'

import { librarySchema } from '@tetra/schemas/library'
import type { LibraryEntities } from '@tetra/schemas/library'
import { createDb } from '@tetra/tinydb/runtime'

import { RunConfigs } from '../run-configs.ts'
import { Transcripts } from './index.ts'
import type { TranscriptSession } from './index.ts'

function createTranscriptHarness() {
  // Tests own the same library db used by app composition roots.
  const library = createDb(librarySchema)
  const runConfigs = new RunConfigs({ library })
  const transcripts = new Transcripts({ library, runConfigs })

  return { library, transcripts }
}

function appendText(
  harness: ReturnType<typeof createTranscriptHarness>,
  session: TranscriptSession,
  args: {
    createdAt: number
    parentMessageId: string | null
    role?: LibraryEntities['messages']['role']
    text: string
  },
): string {
  const messageId = session.appendMessage({
    parentMessageId: args.parentMessageId,
    parts: [{ text: args.text, type: 'text' }],
    role: args.role ?? 'user',
  })

  // Created-at ordering is semantic for thread resolution, so tests pin it explicitly.
  harness.library.messages.update(messageId, {
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
  })

  return messageId
}

function ids(messages: LibraryEntities['messages'][]): string[] {
  return messages.map((message) => message.id)
}

function createForkedTree() {
  const harness = createTranscriptHarness()
  const sessionId = harness.transcripts.createSession({ title: 'Forked' })
  const session = harness.transcripts.getSession(sessionId)

  // Shape a tree with one upstream fork and one downstream fork.
  const rootUserId = appendText(harness, session, {
    createdAt: 1,
    parentMessageId: null,
    text: 'root',
  })
  const olderAssistantId = appendText(harness, session, {
    createdAt: 2,
    parentMessageId: rootUserId,
    role: 'assistant',
    text: 'older assistant',
  })
  const followUpUserId = appendText(harness, session, {
    createdAt: 3,
    parentMessageId: olderAssistantId,
    text: 'follow up',
  })
  const olderLeafId = appendText(harness, session, {
    createdAt: 4,
    parentMessageId: followUpUserId,
    role: 'assistant',
    text: 'older leaf',
  })
  const newerLeafId = appendText(harness, session, {
    createdAt: 5,
    parentMessageId: followUpUserId,
    role: 'assistant',
    text: 'newer leaf',
  })
  const newestRootContinuationId = appendText(harness, session, {
    createdAt: 6,
    parentMessageId: rootUserId,
    role: 'assistant',
    text: 'newest root continuation',
  })

  return {
    followUpUserId,
    harness,
    newerLeafId,
    newestRootContinuationId,
    olderAssistantId,
    olderLeafId,
    rootUserId,
    session,
    sessionId,
  }
}

test('empty sessions have no synthetic root or thread', () => {
  const { transcripts, library } = createTranscriptHarness()
  const sessionId = transcripts.createSession({
    config: { modelId: 'model-a', systemPromptId: 'prompt-a' },
    title: 'Empty',
  })
  const session = transcripts.getSession(sessionId)
  const rootPath = session.getMessagePath({ messageId: null })

  // Sessions are real before they have messages, but there is no implicit message row.
  expect(library.sessions.require(sessionId).title).toBe('Empty')
  expect(library.sessions.require(sessionId).config).toMatchObject({
    modelId: 'model-a',
    systemPromptId: 'prompt-a',
  })
  expect(session.getNewestLeafMessageId()).toBeNull()
  expect(session.listMessages()).toEqual([])
  expect(session.listContinuations(null)).toEqual([])
  expect(rootPath.message()).toBeNull()
  expect(rootPath.messages()).toEqual([])
})

test('renameSession trims the title and touches updatedAt', () => {
  const { transcripts, library } = createTranscriptHarness()
  const originalDateNow = Date.now

  try {
    // Pin time so the title edit proves it owns only updatedAt, not createdAt.
    Date.now = () => 10
    const sessionId = transcripts.createSession({ title: 'Draft' })

    Date.now = () => 20
    transcripts.renameSession({ sessionId, title: '  Renamed  ' })

    expect(library.sessions.require(sessionId)).toMatchObject({
      createdAt: 10,
      title: 'Renamed',
      updatedAt: 20,
    })
  } finally {
    Date.now = originalDateNow
  }
})

test('renameSession rejects empty titles', () => {
  const { transcripts, library } = createTranscriptHarness()
  const sessionId = transcripts.createSession({ title: 'Draft' })
  const original = library.sessions.require(sessionId)

  expect(() => {
    transcripts.renameSession({ sessionId, title: '   ' })
  }).toThrow('Title cannot be empty')
  expect(library.sessions.require(sessionId)).toEqual(original)
})

test('renameSession throws when the session does not exist', () => {
  const { transcripts } = createTranscriptHarness()

  expect(() => {
    transcripts.renameSession({ sessionId: 'missing', title: 'Renamed' })
  }).toThrow('Missing row: sessions/missing')
})

test('blank sessions infer a title from the first user message', () => {
  const { transcripts, library } = createTranscriptHarness()
  const textSession = transcripts.getSession(transcripts.createSession())
  const titledSessionId = transcripts.createSession({ title: 'Manual title' })
  const assistantSession = transcripts.getSession(transcripts.createSession())
  const imageSession = transcripts.getSession(transcripts.createSession())
  const firstText = `  ${'This message should become the inferred session title. '.repeat(5)}  `

  // User text names a blank session once, capped to the transcript-owned preview length.
  const firstMessageId = textSession.appendMessage({
    parentMessageId: null,
    parts: [{ text: firstText, type: 'text' }],
    role: 'user',
  })
  textSession.appendMessage({
    parentMessageId: firstMessageId,
    parts: [{ text: 'A later message should not rename the session', type: 'text' }],
    role: 'user',
  })
  expect(library.sessions.require(textSession.id).title).toBe(
    `${firstText.trim().slice(0, 200)}...`,
  )

  // Existing titles and non-user messages stay caller-owned.
  transcripts.getSession(titledSessionId).appendMessage({
    parentMessageId: null,
    parts: [{ text: 'Do not overwrite me', type: 'text' }],
    role: 'user',
  })
  assistantSession.appendMessage({
    parentMessageId: null,
    parts: [{ text: 'Assistant should not name a session', type: 'text' }],
    role: 'assistant',
  })
  expect(library.sessions.require(titledSessionId).title).toBe('Manual title')
  expect(library.sessions.require(assistantSession.id).title).toBe('')

  // Image-only user messages preserve the existing composer fallback title.
  imageSession.appendMessage({
    parentMessageId: null,
    parts: [{ filename: 'image.png', mediaType: 'image/png', type: 'file', url: 'data:image/png' }],
    role: 'user',
  })
  expect(library.sessions.require(imageSession.id).title).toBe('Image')
})

test('session creation can attach colocated library state in the same transaction', () => {
  const { library, transcripts } = createTranscriptHarness()
  let finishedTransactions = 0
  const listenerId = library.raw.store.addDidFinishTransactionListener(() => {
    finishedTransactions += 1
  })

  const sessionId = transcripts.createSession({
    onCreate(id) {
      library.messages.set('msg_seed', {
        createdAt: 1,
        parentMessageId: null,
        parts: [{ text: 'seed', type: 'text' }],
        role: 'user',
        sessionId: id,
        updatedAt: 1,
      })
    },
  })

  // Caller-owned library rows can be created atomically with the backing session.
  library.raw.store.delListener(listenerId)
  expect(library.sessions.get(sessionId)).not.toBeNull()
  expect(library.messages.require('msg_seed').sessionId).toBe(sessionId)
  expect(finishedTransactions).toBe(1)
})

test('message paths are exact cursors and continuations are fork-point choices', () => {
  const { followUpUserId, newerLeafId, olderAssistantId, olderLeafId, rootUserId, session } =
    createForkedTree()

  // Message paths can end before a leaf; continuations are asked for separately.
  const upstreamPath = session.getMessagePath({ messageId: olderAssistantId })
  expect(upstreamPath.sessionId).toBe(session.id)
  expect(upstreamPath.message()?.id).toBe(olderAssistantId)
  expect(ids(upstreamPath.messages())).toEqual([rootUserId, olderAssistantId])
  expect(ids(session.listContinuations(olderAssistantId))).toEqual([followUpUserId])
  expect(ids(session.listContinuations(followUpUserId))).toEqual([olderLeafId, newerLeafId])
  expect(session.listContinuations(followUpUserId)).toHaveLength(2)
})

test('threads resolve from any anchor to the newest descendant leaf', () => {
  const {
    followUpUserId,
    newestRootContinuationId,
    newerLeafId,
    olderAssistantId,
    olderLeafId,
    rootUserId,
    session,
  } = createForkedTree()

  // The newest session leaf seeds surfaces, but subtree anchors resolve within their subtree.
  expect(session.getNewestLeafMessageId()).toBe(newestRootContinuationId)
  expect(session.resolveThread({ fromMessageId: rootUserId }).leafMessageId).toBe(
    newestRootContinuationId,
  )
  expect(ids(session.resolveThread({ fromMessageId: rootUserId }).messages())).toEqual([
    rootUserId,
    newestRootContinuationId,
  ])
  expect(ids(session.resolveThread({ fromMessageId: olderAssistantId }).messages())).toEqual([
    rootUserId,
    olderAssistantId,
    followUpUserId,
    newerLeafId,
  ])
  expect(ids(session.resolveThread({ fromMessageId: olderLeafId }).messages())).toEqual([
    rootUserId,
    olderAssistantId,
    followUpUserId,
    olderLeafId,
  ])
})

test('stale thread handles fail loudly after their leaf gains a continuation', () => {
  const harness = createTranscriptHarness()
  const session = harness.transcripts.getSession(harness.transcripts.createSession())
  const rootUserId = appendText(harness, session, {
    createdAt: 1,
    parentMessageId: null,
    text: 'root',
  })
  const assistantId = appendText(harness, session, {
    createdAt: 2,
    parentMessageId: rootUserId,
    role: 'assistant',
    text: 'assistant',
  })
  const resolvedThread = session.resolveThread({ fromMessageId: rootUserId })

  // Thread anchors can be re-resolved; an old resolved thread should not masquerade as current.
  const followUpId = appendText(harness, session, {
    createdAt: 3,
    parentMessageId: assistantId,
    text: 'follow up',
  })
  expect(() => resolvedThread.leafMessage()).toThrow(
    `Resolved thread is stale because ${assistantId} is no longer a leaf`,
  )
  expect(() => resolvedThread.messages()).toThrow(
    `Resolved thread is stale because ${assistantId} is no longer a leaf`,
  )
  expect(session.resolveThread({ fromMessageId: rootUserId }).leafMessageId).toBe(followUpId)
})

test('run context uses the exact parent path and excludes the target message', () => {
  const harness = createTranscriptHarness()
  const session = harness.transcripts.getSession(harness.transcripts.createSession())
  const rootUserId = appendText(harness, session, {
    createdAt: 1,
    parentMessageId: null,
    text: 'root',
  })
  const assistantId = appendText(harness, session, {
    createdAt: 2,
    parentMessageId: rootUserId,
    role: 'assistant',
    text: 'assistant',
  })
  const followUpId = appendText(harness, session, {
    createdAt: 3,
    parentMessageId: assistantId,
    text: 'follow up',
  })
  const targetId = session.appendMessage({
    parentMessageId: followUpId,
    parts: [],
    role: 'assistant',
  })

  // Runs use the exact parent path before the placeholder, never including the target.
  const contextMessageIds = ids(session.getMessagePath({ messageId: followUpId }).messages())
  expect(ids(session.getMessagePath({ messageId: null }).messages())).toEqual([])
  expect(contextMessageIds).toEqual([rootUserId, assistantId, followUpId])
  expect(contextMessageIds).not.toContain(targetId)
})

test('session-scoped APIs reject messages owned by another session', () => {
  const { transcripts } = createTranscriptHarness()
  const firstSession = transcripts.getSession(transcripts.createSession())
  const secondSession = transcripts.getSession(transcripts.createSession())
  const firstMessageId = firstSession.appendMessage({
    parentMessageId: null,
    parts: [{ text: 'mine', type: 'text' }],
    role: 'user',
  })

  // Parentage, paths, threads, continuations, edits, and deletes all stay session-scoped.
  expect(() =>
    secondSession.appendMessage({
      parentMessageId: firstMessageId,
      parts: [{ text: 'nope', type: 'text' }],
      role: 'assistant',
    }),
  ).toThrow(`Message ${firstMessageId} does not belong to session ${secondSession.id}`)
  expect(() => secondSession.getMessagePath({ messageId: firstMessageId })).toThrow(
    `Message ${firstMessageId} does not belong to session ${secondSession.id}`,
  )
  expect(() => secondSession.resolveThread({ fromMessageId: firstMessageId })).toThrow(
    `Message ${firstMessageId} does not belong to session ${secondSession.id}`,
  )
  expect(() => secondSession.listContinuations(firstMessageId)).toThrow(
    `Message ${firstMessageId} does not belong to session ${secondSession.id}`,
  )
  expect(() => {
    secondSession.editMessage(firstMessageId, { role: 'critic' })
  }).toThrow(`Message ${firstMessageId} does not belong to session ${secondSession.id}`)
  expect(() => {
    secondSession.deleteMessage(firstMessageId)
  }).toThrow(`Message ${firstMessageId} does not belong to session ${secondSession.id}`)
})

test('edits preserve parentage and deletes are leaf-only', () => {
  const { transcripts, library } = createTranscriptHarness()
  const session = transcripts.getSession(transcripts.createSession())
  const rootUserId = session.appendMessage({
    parentMessageId: null,
    parts: [{ text: 'root', type: 'text' }],
    role: 'user',
  })
  const assistantId = session.appendMessage({
    parentMessageId: rootUserId,
    parts: [{ text: 'assistant', type: 'text' }],
    role: 'assistant',
  })

  // Edits mutate content in place; deletion refuses to orphan descendants.
  session.editMessage(rootUserId, {
    parts: [{ text: 'edited root', type: 'text' }],
    role: 'critic',
  })
  expect(library.messages.require(rootUserId)).toMatchObject({
    parentMessageId: null,
    parts: [{ text: 'edited root', type: 'text' }],
    role: 'critic',
  })
  expect(() => {
    session.deleteMessage(rootUserId)
  }).toThrow(`Cannot delete message with descendants: ${rootUserId}`)
  session.deleteMessage(assistantId)
  expect(library.messages.get(assistantId)).toBeNull()
  expect(library.messages.get(rootUserId)).not.toBeNull()
})

test('exports preserve the whole message tree, not only one resolved thread', () => {
  const {
    harness,
    newestRootContinuationId,
    newerLeafId,
    olderAssistantId,
    rootUserId,
    sessionId,
  } = createForkedTree()
  const session = harness.transcripts.getSession(sessionId)
  const exported = session.export()
  const resolvedFromOlderAssistant = session.resolveThread({ fromMessageId: olderAssistantId })

  // Export is for durable inspection, so alternate continuations stay present.
  expect(ids(exported.messages).toSorted()).toEqual(ids(session.listMessages()).toSorted())
  expect(exported.messages).toHaveLength(6)
  expect(ids(resolvedFromOlderAssistant.messages())).toContain(newerLeafId)
  expect(ids(resolvedFromOlderAssistant.messages())).not.toContain(newestRootContinuationId)
  expect(ids(exported.messages)).toContain(rootUserId)
  expect(ids(exported.messages)).toContain(olderAssistantId)
  expect(ids(exported.messages)).toContain(newerLeafId)
  expect(ids(exported.messages)).toContain(newestRootContinuationId)
})

test('corrupt message trees fail loudly instead of inventing a thread', () => {
  const { transcripts, library } = createTranscriptHarness()
  const sessionId = transcripts.createSession()
  const session = transcripts.getSession(sessionId)

  // A self-parented row cannot be created through appendMessage, but sync corruption can expose it.
  library.messages.set('msg_cycle', {
    createdAt: 1,
    parentMessageId: 'msg_cycle',
    parts: [],
    role: 'user',
    sessionId,
    updatedAt: 1,
  })

  expect(() => session.getNewestLeafMessageId()).toThrow(
    `Cannot determine newest leaf for session ${sessionId}: no leaf message found`,
  )
  expect(() => session.resolveThread({ fromMessageId: 'msg_cycle' })).toThrow(
    'Cannot resolve thread from message msg_cycle: no descendant leaf found',
  )
  expect(() => session.getMessagePath({ messageId: 'msg_cycle' }).messages()).toThrow(
    'Cycle detected in transcript path at message: msg_cycle',
  )
})
