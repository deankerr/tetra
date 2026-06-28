import { expect, test } from 'bun:test'

import type { CliAppContext } from './app'
import { createCliAppContext } from './app'
import { createCliProgram } from './program'
import { createInMemoryCliStores } from './store'

interface CliRunResult {
  err: string[]
  out: string[]
}

function createCliTestApp(): CliAppContext {
  // CLI integration tests use the real app modules over fresh in-memory TinyBase stores.
  return createCliAppContext({ stores: createInMemoryCliStores() })
}

async function runCli(ctx: CliAppContext, args: string[]): Promise<CliRunResult> {
  const out: string[] = []
  const err: string[] = []
  const originalLog = console.log
  const originalError = console.error
  const program = createCliProgram({
    getContext: async () => {
      await Promise.resolve()
      return ctx
    },
  })

  // The only harness replacement here is process output capture.
  console.log = (...values: unknown[]) => {
    out.push(values.map(String).join(' '))
  }
  console.error = (...values: unknown[]) => {
    err.push(values.map(String).join(' '))
  }

  try {
    await program.parseAsync(args, { from: 'user' })
  } finally {
    console.log = originalLog
    console.error = originalError
  }

  return { err, out }
}

async function catchCommandError(operation: () => unknown): Promise<unknown> {
  // Negative-path command tests need the thrown value without replacing app internals.
  try {
    await operation()
    return undefined
  } catch (error) {
    return error
  }
}

test('session and message commands mutate real in-memory app state', async () => {
  const ctx = createCliTestApp()

  // Session creation goes through Commander, core transcripts, run config, and CLI workspace state.
  const created = await runCli(ctx, [
    'sessions',
    'create',
    '--model',
    'openrouter/test-model',
    '--title',
    'Draft',
  ])
  const sessionId = created.out[0] ?? ''
  const session = ctx.stores.library.typedStore.tables.sessions.requireEntity(sessionId)

  expect(session.title).toBe('Draft')
  expect(session.config.modelId).toBe('openrouter/test-model')
  expect(ctx.workspace.getActiveSessionId()).toBe(sessionId)

  // Listing observes the same workspace selection and durable session row.
  const listed = await runCli(ctx, ['sessions', 'list'])
  expect(listed.out).toHaveLength(1)
  expect(listed.out[0]?.startsWith(`* ${sessionId}  Draft  `)).toBe(true)

  // Message creation resolves the active session and appends through the transcript module.
  const added = await runCli(ctx, ['messages', 'add', 'hello', 'there'])
  const messageId = added.out[0] ?? ''
  const message = ctx.stores.library.typedStore.tables.messages.requireEntity(messageId)

  expect(message.parentMessageId).toBeNull()
  expect(message.parts).toEqual([{ text: 'hello there', type: 'text' }])
  expect(message.role).toBe('user')
  expect(message.sessionId).toBe(sessionId)

  // History resolves the newest real transcript leaf and renders the stored message row.
  const history = await runCli(ctx, ['sessions', 'history'])
  expect(history.out).toEqual([`\n[user ${messageId}]\nhello there`])
})

test('prompt commands create and unlink session config through real modules', async () => {
  const ctx = createCliTestApp()

  // Prompt creation and session creation share the same library store.
  const createdPrompt = await runCli(ctx, ['prompts', 'create', '--label', 'Terse', 'Be terse.'])
  const promptId = createdPrompt.out[0] ?? ''
  const createdSession = await runCli(ctx, ['sessions', 'create', '--prompt', promptId])
  const sessionId = createdSession.out[0] ?? ''

  expect(ctx.stores.library.typedStore.tables.prompts.requireEntity(promptId).label).toBe('Terse')
  expect(
    ctx.stores.library.typedStore.tables.sessions.requireEntity(sessionId).config.systemPromptId,
  ).toBe(promptId)

  // Prompt deletion exercises the core prompt cleanup path instead of manually editing rows.
  const deleted = await runCli(ctx, ['prompts', 'delete', promptId])
  expect(deleted.out).toEqual([promptId])
  expect(ctx.stores.library.typedStore.tables.prompts.getEntity(promptId)).toBeNull()
  expect(
    ctx.stores.library.typedStore.tables.sessions.requireEntity(sessionId).config.systemPromptId,
  ).toBe('')
})

test('commands fail through real active-session resolution', async () => {
  const ctx = createCliTestApp()

  // Missing CLI workspace selection is checked through the real app context, not a fake shape.
  const error = await catchCommandError(async () => {
    await runCli(ctx, ['messages', 'add', 'hello'])
  })

  expect(error).toBeInstanceOf(Error)
  if (!(error instanceof Error)) {
    throw new Error('Expected command to throw an Error')
  }
  expect(error.message).toContain('No active session')
})
