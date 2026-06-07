import { expect, test } from 'bun:test'

import { createRawStore, tetraStoreSchema, tetraIndexIds } from '@tetra/store-schema'
import { bindIndexes, bindStore } from '@tetra/tinybase-schema'

import { Transcripts } from './transcripts.ts'

function createTestTranscripts() {
  // Tests bind the same raw TinyBase objects that app composition roots use.
  const { rawIndexes, rawStore } = createRawStore()
  const typedStore = bindStore(rawStore, tetraStoreSchema.tables, tetraStoreSchema.values)
  const typedIndexes = bindIndexes(rawIndexes, tetraIndexIds)
  const transcripts = new Transcripts({ rawStore, typedIndexes, typedStore })

  return { rawStore, transcripts, typedIndexes, typedStore }
}

test('createSession starts with an empty default thread', () => {
  const { transcripts, typedStore } = createTestTranscripts()
  const sessionId = transcripts.createSession({ title: 'Tree time' })
  const session = transcripts.getSession(sessionId)
  const thread = session.getThread()

  // Empty sessions have no synthetic root message or durable active thread pointer.
  expect(typedStore.tables.sessions.requireEntity(sessionId).title).toBe('Tree time')
  expect(thread.message()).toBeNull()
  expect(thread.messages()).toEqual([])
  expect(thread.children()).toEqual([])
})

test('focused threads stop at the cursor and expose children as navigation choices', () => {
  const { transcripts } = createTestTranscripts()
  const sessionId = transcripts.createSession()
  const session = transcripts.getSession(sessionId)

  // Build one linear path with explicit parent ids at every append boundary.
  const userMessageId = session.appendMessage({
    parentMessageId: null,
    parts: [{ text: 'root', type: 'text' }],
    role: 'user',
  })
  const assistantMessageId = session.appendMessage({
    parentMessageId: userMessageId,
    parts: [{ text: 'child', type: 'text' }],
    role: 'assistant',
  })

  // Focused reads return the path to the cursor, while children stay separate.
  const focusedThread = session.getThread({ messageId: userMessageId })
  expect(focusedThread.messages().map((message) => message.id)).toEqual([userMessageId])
  expect(focusedThread.children().map((message) => message.id)).toEqual([assistantMessageId])
  expect(focusedThread.hasChildren()).toBe(true)
})

test('default thread follows the newest leaf and keeps older siblings available', async () => {
  const { transcripts } = createTestTranscripts()
  const sessionId = transcripts.createSession()
  const session = transcripts.getSession(sessionId)

  // Create an initial assistant output under a user message.
  const userMessageId = session.appendMessage({
    parentMessageId: null,
    parts: [{ text: 'again', type: 'text' }],
    role: 'user',
  })
  const firstAssistantId = session.appendMessage({
    parentMessageId: userMessageId,
    parts: [{ text: 'first', type: 'text' }],
    role: 'assistant',
  })

  // Regeneration is a caller-created sibling, not deletion of the existing output.
  await Bun.sleep(1)
  const secondAssistantId = session.appendMessage({
    parentMessageId: userMessageId,
    parts: [],
    role: 'assistant',
  })

  // The default path moves to the newest leaf, but both sibling children remain inspectable.
  expect(
    session
      .getThread()
      .messages()
      .map((message) => message.id),
  ).toEqual([userMessageId, secondAssistantId])
  expect(
    session
      .getThread({ messageId: userMessageId })
      .children()
      .map((message) => message.id),
  ).toEqual([firstAssistantId, secondAssistantId])
})

test('session-scoped APIs reject messages owned by another session', () => {
  const { transcripts } = createTestTranscripts()
  const firstSession = transcripts.getSession(transcripts.createSession())
  const secondSession = transcripts.getSession(transcripts.createSession())

  // Parent links cannot cross session ownership boundaries.
  const firstMessageId = firstSession.appendMessage({
    parentMessageId: null,
    parts: [{ text: 'mine', type: 'text' }],
    role: 'user',
  })

  expect(() =>
    secondSession.appendMessage({
      parentMessageId: firstMessageId,
      parts: [{ text: 'nope', type: 'text' }],
      role: 'assistant',
    }),
  ).toThrow(`Message ${firstMessageId} does not belong to session ${secondSession.id}`)
  expect(() => secondSession.getThread({ messageId: firstMessageId })).toThrow(
    `Message ${firstMessageId} does not belong to session ${secondSession.id}`,
  )
  expect(() => {
    secondSession.editMessage(firstMessageId, { role: 'critic' })
  }).toThrow(`Message ${firstMessageId} does not belong to session ${secondSession.id}`)
  expect(() => {
    secondSession.deleteMessage(firstMessageId)
  }).toThrow(`Message ${firstMessageId} does not belong to session ${secondSession.id}`)
})

test('editMessage mutates content in place without changing parentage', () => {
  const { transcripts, typedStore } = createTestTranscripts()
  const session = transcripts.getSession(transcripts.createSession())

  // Edits update the existing row; they do not create hidden replacement messages.
  const messageId = session.appendMessage({
    parentMessageId: null,
    parts: [{ text: 'before', type: 'text' }],
    role: 'user',
  })
  session.editMessage(messageId, {
    parts: [{ text: 'after', type: 'text' }],
    role: 'critic',
  })

  expect(typedStore.tables.messages.getRowIds()).toEqual([messageId])
  expect(typedStore.tables.messages.requireEntity(messageId)).toMatchObject({
    parentMessageId: null,
    parts: [{ text: 'after', type: 'text' }],
    role: 'critic',
  })
})

test('deleteMessage is leaf-only in the first slice', () => {
  const { transcripts, typedStore } = createTestTranscripts()
  const session = transcripts.getSession(transcripts.createSession())

  // Non-leaf deletion fails loudly until a subtree deletion policy exists.
  const parentMessageId = session.appendMessage({
    parentMessageId: null,
    parts: [{ text: 'parent', type: 'text' }],
    role: 'user',
  })
  const childMessageId = session.appendMessage({
    parentMessageId,
    parts: [{ text: 'child', type: 'text' }],
    role: 'assistant',
  })

  expect(() => {
    session.deleteMessage(parentMessageId)
  }).toThrow(`Cannot delete message with descendants: ${parentMessageId}`)

  // Leaf deletion removes only the selected message and leaves the parent available.
  session.deleteMessage(childMessageId)
  expect(typedStore.tables.messages.getEntity(childMessageId)).toBeNull()
  expect(typedStore.tables.messages.getEntity(parentMessageId)).not.toBeNull()
  expect(session.getThread({ messageId: parentMessageId }).children()).toEqual([])
})

test('exportSession includes all messages, not only the default thread', async () => {
  const { transcripts } = createTestTranscripts()
  const sessionId = transcripts.createSession()
  const session = transcripts.getSession(sessionId)

  // Create two assistant leaves so the default view hides one branch.
  const userMessageId = session.appendMessage({
    parentMessageId: null,
    parts: [{ text: 'fork', type: 'text' }],
    role: 'user',
  })
  const oldAssistantId = session.appendMessage({
    parentMessageId: userMessageId,
    parts: [{ text: 'old', type: 'text' }],
    role: 'assistant',
  })
  await Bun.sleep(1)
  const newAssistantId = session.appendMessage({
    parentMessageId: userMessageId,
    parts: [{ text: 'new', type: 'text' }],
    role: 'assistant',
  })

  // Export stays complete even though the default thread follows only the newer leaf.
  const exported = transcripts.exportSession(sessionId)
  expect(exported).not.toHaveProperty('threads')
  expect(exported.messages).toHaveLength(3)
  expect(exported.messages.map((message) => message.id).toSorted()).toEqual(
    [userMessageId, oldAssistantId, newAssistantId].toSorted(),
  )
  expect(
    session
      .getThread()
      .messages()
      .map((message) => message.id),
  ).toEqual([userMessageId, newAssistantId])
})
