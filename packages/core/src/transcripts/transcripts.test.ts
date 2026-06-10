import { expect, test } from 'bun:test'

import { createRawStore, tetraIndexIds, tetraStoreSchema } from '@tetra/store-schema'
import type { Rows } from '@tetra/store-schema'
import { bindIndexes, bindStore } from '@tetra/tinybase-schema'

import { Transcripts } from './index.ts'
import type { TranscriptSession } from './index.ts'

function createTranscriptHarness() {
  // Tests bind the same raw TinyBase objects used by app composition roots.
  const { rawIndexes, rawStore } = createRawStore()
  const typedStore = bindStore(rawStore, tetraStoreSchema.tables, tetraStoreSchema.values)
  const typedIndexes = bindIndexes(rawIndexes, tetraIndexIds)
  const transcripts = new Transcripts({ rawStore, typedIndexes, typedStore })

  return { rawStore, transcripts, typedIndexes, typedStore }
}

function appendText(
  harness: ReturnType<typeof createTranscriptHarness>,
  session: TranscriptSession,
  args: {
    createdAt: number
    parentMessageId: string | null
    role?: Rows['messages']['role']
    text: string
  },
): string {
  const messageId = session.appendMessage({
    parentMessageId: args.parentMessageId,
    parts: [{ text: args.text, type: 'text' }],
    role: args.role ?? 'user',
  })

  // Created-at ordering is semantic for thread resolution, so tests pin it explicitly.
  harness.typedStore.tables.messages.updateRow(messageId, {
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
  })

  return messageId
}

function ids(messages: Rows['messages'][]): string[] {
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
  const { transcripts, typedStore } = createTranscriptHarness()
  const sessionId = transcripts.createSession({
    config: { modelId: 'model-a', systemPromptId: 'prompt-a' },
    title: 'Empty',
  })
  const session = transcripts.getSession(sessionId)
  const rootPath = session.getMessagePath({ messageId: null })

  // Sessions are real before they have messages, but there is no implicit message row.
  expect(typedStore.tables.sessions.requireEntity(sessionId).title).toBe('Empty')
  expect(typedStore.tables.sessionRunConfigs.requireEntity(sessionId)).toMatchObject({
    modelId: 'model-a',
    systemPromptId: 'prompt-a',
  })
  expect(session.getNewestLeafMessageId()).toBeNull()
  expect(session.listMessages()).toEqual([])
  expect(session.listContinuations(null)).toEqual([])
  expect(rootPath.message()).toBeNull()
  expect(rootPath.messages()).toEqual([])
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
  const { transcripts, typedStore } = createTranscriptHarness()
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
  expect(typedStore.tables.messages.requireEntity(rootUserId)).toMatchObject({
    parentMessageId: null,
    parts: [{ text: 'edited root', type: 'text' }],
    role: 'critic',
  })
  expect(() => {
    session.deleteMessage(rootUserId)
  }).toThrow(`Cannot delete message with descendants: ${rootUserId}`)
  session.deleteMessage(assistantId)
  expect(typedStore.tables.messages.getEntity(assistantId)).toBeNull()
  expect(typedStore.tables.messages.getEntity(rootUserId)).not.toBeNull()
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
  const { transcripts, typedStore } = createTranscriptHarness()
  const sessionId = transcripts.createSession()
  const session = transcripts.getSession(sessionId)

  // A self-parented row cannot be created through appendMessage, but sync corruption can expose it.
  typedStore.tables.messages.setRow('msg_cycle', {
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
