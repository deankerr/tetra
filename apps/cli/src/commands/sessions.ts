import type { RunConfig } from '@tetra/core'
import type { Command } from 'commander'

import type { CliAppContext } from '../app'
import {
  configFromOptions,
  formatSession,
  printMessages,
  printRunConfig,
  requireSession,
  resolveSessionId,
} from './shared'

interface CreateOptions {
  model?: string
  prompt?: string
  title?: string
}

interface ConfigSetOptions {
  maxMessages?: number
  model?: string
  prompt?: string
}

export function registerSessionCommands(
  program: Command,
  getContext: () => Promise<CliAppContext>,
): void {
  // Sessions are the durable transcript workspaces used by web and CLI.
  const sessions = program.command('sessions').description('Manage sessions')

  // List durable sessions and mark the CLI-local active selection.
  sessions
    .command('list')
    .description('List sessions')
    .action(async () => {
      const ctx = await getContext()
      const activeSessionId = ctx.workspace.getActiveSessionId()
      const rows = ctx.stores.library.typedStore.tables.sessions
        .listEntities()
        .toSorted((a, b) => b.updatedAt - a.updatedAt)

      if (rows.length === 0) {
        console.log('No sessions. Run: tetra sessions create --title "New Session"')
        return
      }

      for (const session of rows) {
        console.log(formatSession(session, activeSessionId))
      }
    })

  // Create an empty session and make it the active CLI target.
  sessions
    .command('create')
    .description('Create a session')
    .option('-M, --model <modelId>', 'Model to store on the session RunConfig')
    .option('-p, --prompt <promptId>', 'Stored system prompt id')
    .option('-t, --title <title>', 'Session title')
    .action(async (options: CreateOptions) => {
      const ctx = await getContext()
      const config = configFromOptions(options)
      if (options.prompt !== undefined) {
        ctx.stores.library.typedStore.tables.prompts.requireEntity(options.prompt)
      }

      const sessionId = ctx.transcripts.createSession({
        config,
        title: options.title ?? 'Untitled Session',
      })
      ctx.workspace.setActiveSessionId(sessionId)
      console.log(sessionId)
    })

  // Show session metadata and its current durable RunConfig.
  sessions
    .command('show <id>')
    .description('Show a session')
    .action(async (sessionId: string) => {
      const ctx = await getContext()
      const session = ctx.stores.library.typedStore.tables.sessions.requireEntity(sessionId)
      const messageCount = ctx.stores.library.typedIndexes.getSliceRowIds(
        'messagesBySession',
        sessionId,
      ).length
      const runCount = ctx.stores.library.typedIndexes.getSliceRowIds(
        'runsBySessionNewestFirst',
        sessionId,
      ).length

      console.log(`id:        ${session.id}`)
      console.log(`title:     ${session.title.trim() || '(untitled)'}`)
      console.log(`created:   ${new Date(session.createdAt).toLocaleString()}`)
      console.log(`updated:   ${new Date(session.updatedAt).toLocaleString()}`)
      console.log(`messages:  ${messageCount}`)
      console.log(`runs:      ${runCount}`)
      printRunConfig(ctx, sessionId)
    })

  // Print the newest root-to-leaf thread for a session.
  sessions
    .command('history')
    .argument('[id]', 'Session id, defaults to active')
    .description('Print message history')
    .action(async (sessionId: string | undefined) => {
      const ctx = await getContext()
      const resolvedSessionId = resolveSessionId(ctx, sessionId)
      const session = ctx.transcripts.getSession(resolvedSessionId)
      const threadAnchorMessageId = session.getNewestLeafMessageId()
      if (threadAnchorMessageId === null) {
        console.log('No messages in this session.')
        return
      }

      const thread = session.resolveThread({ fromMessageId: threadAnchorMessageId })
      printMessages(thread.messages())
    })

  // Rename a durable session row.
  sessions
    .command('rename <id>')
    .argument('<title...>', 'New title')
    .description('Rename a session')
    .action(async (sessionId: string, titleParts: string[]) => {
      const ctx = await getContext()
      requireSession(ctx, sessionId)
      const title = titleParts.join(' ').trim()
      if (title === '') {
        throw new Error('Title cannot be empty')
      }

      ctx.stores.library.typedStore.tables.sessions.updateRow(sessionId, {
        title,
        updatedAt: Date.now(),
      })
      console.log(sessionId)
    })

  // Delete a session cascade and clear the CLI active selection when needed.
  sessions
    .command('delete <id>')
    .description('Delete a session')
    .action(async (sessionId: string) => {
      const ctx = await getContext()
      ctx.transcripts.deleteSession(sessionId)
      if (ctx.workspace.getActiveSessionId() === sessionId) {
        ctx.workspace.clearActiveSessionId()
      }
      console.log(sessionId)
    })

  // Show the CLI-local active session id.
  sessions
    .command('active')
    .description('Show the active session')
    .action(async () => {
      const ctx = await getContext()
      console.log(ctx.workspace.getActiveSessionId() ?? '(none)')
    })

  // Set the CLI-local active session id.
  sessions
    .command('use <id>')
    .description('Set the active session')
    .action(async (sessionId: string) => {
      const ctx = await getContext()
      requireSession(ctx, sessionId)
      ctx.workspace.setActiveSessionId(sessionId)
      console.log(sessionId)
    })

  // Clear the CLI-local active session id.
  sessions
    .command('clear-active')
    .description('Clear the active session')
    .action(async () => {
      const ctx = await getContext()
      ctx.workspace.clearActiveSessionId()
      console.log('(none)')
    })

  // Session RunConfig commands stay nested under sessions because config is session-owned.
  registerSessionConfigCommands(sessions, getContext)
}

function registerSessionConfigCommands(
  sessions: Command,
  getContext: () => Promise<CliAppContext>,
): void {
  // Session RunConfig is edited in place and resolved when a run starts.
  const config = sessions.command('config').description('Manage session RunConfig')

  // Show a session RunConfig, defaulting to the active session for inspection.
  config
    .command('show')
    .argument('[id]', 'Session id, defaults to active')
    .description('Show session RunConfig')
    .action(async (sessionId: string | undefined) => {
      const ctx = await getContext()
      printRunConfig(ctx, resolveSessionId(ctx, sessionId))
    })

  // Apply explicit RunConfig fields to a specific session.
  config
    .command('set <id>')
    .description('Set session RunConfig fields')
    .option('-M, --model <modelId>', 'Model id')
    .option('-n, --max-messages <n>', 'Max messages for context window', parseCount)
    .option('-p, --prompt <promptId>', 'Stored system prompt id')
    .action(async (sessionId: string, options: ConfigSetOptions) => {
      const ctx = await getContext()
      requireSession(ctx, sessionId)
      if (options.prompt !== undefined) {
        ctx.stores.library.typedStore.tables.prompts.requireEntity(options.prompt)
      }

      const update: Partial<RunConfig> = configFromOptions(options)
      if (Object.keys(update).length === 0) {
        throw new Error('No config fields provided')
      }

      ctx.runConfigs.update(sessionId, update)
      printRunConfig(ctx, sessionId)
    })

  // Copy one session's RunConfig into the new-session default.
  config
    .command('save-default <id>')
    .description('Use this session RunConfig as the new-session default')
    .action(async (sessionId: string) => {
      const ctx = await getContext()
      requireSession(ctx, sessionId)
      ctx.runConfigs.setAsDefault(sessionId)
      console.log(sessionId)
    })
}

function parseCount(value: string): number {
  // Commander parsers should fail fast with a useful field-level error.
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, got: ${value}`)
  }

  return parsed
}
