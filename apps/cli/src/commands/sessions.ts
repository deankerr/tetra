import type { RequestConfigType } from '@tetra/core'
import type { Command } from 'commander'

import type { bootstrap } from '../bootstrap'
import { readMessage } from '../lib/input'
import { formatSession, printMessages } from '../lib/output'
import { titleFromMessage } from '../lib/title'
import { runChatContent } from './chat'

type CliContext = Awaited<ReturnType<typeof bootstrap>>

export function registerSessionCommands(
  program: Command,
  getContext: () => Promise<CliContext>,
): void {
  // Create a session, optionally using the first message as both prompt and title source.
  program
    .command('new')
    .argument('[message...]', 'Optional first message')
    .option('-M, --model <modelId>', 'Model to use')
    .option('-m, --message <message>', 'Prompt prefix, useful with stdin')
    .option('-p, --prompt <promptId>', 'Stored system prompt id override')
    .option('-t, --title <title>', 'Session title')
    .option('--no-active', 'Do not update the active session')
    .option('--no-prompt', 'Send without a system prompt')
    .action(
      async (
        parts: string[],
        opts: {
          active?: boolean
          message?: string
          model?: string
          prompt?: false | string
          title?: string
        },
      ) => {
        const ctx = await getContext()
        const content = await readMessage({ message: opts.message, parts })
        const config: Partial<RequestConfigType> = {
          ...(opts.model !== undefined && { modelId: opts.model }),
          ...(typeof opts.prompt === 'string' && { systemPromptId: opts.prompt }),
        }
        if (opts.prompt === false) {
          config.systemPromptId = ''
        }

        if (content.trim() !== '') {
          const sessionId = ctx.helpers.createSession({
            config,
            title: opts.title ?? titleFromMessage(content),
          })
          if (opts.active !== false) {
            ctx.workspace.setActiveSessionId(sessionId)
          }
          await runChatContent(ctx, content, {
            active: opts.active,
            new: false,
            session: sessionId,
          })
          return
        }

        const sessionId = ctx.helpers.createSession({
          config,
          title: opts.title ?? 'Untitled Session',
        })
        if (opts.active !== false) {
          ctx.workspace.setActiveSessionId(sessionId)
        }
        console.log(sessionId)
      },
    )

  // List sessions with the active session clearly marked.
  program
    .command('sessions')
    .alias('ls')
    .description('List sessions')
    .action(async () => {
      const ctx = await getContext()
      const sessions = ctx.helpers.typedStore.tables.sessions
        .listEntities()
        .toSorted((a, b) => a.createdAt - b.createdAt)
      const activeSessionId = ctx.workspace.getActiveSessionId()

      if (sessions.length === 0) {
        console.log('No sessions. Run: tetra "hello"')
        return
      }

      for (const session of sessions) {
        console.log(formatSession(session, activeSessionId))
      }
    })

  // Show or set the active session id.
  program
    .command('active')
    .argument('[id]', 'Session id')
    .description('Show or set the active session')
    .action(async (sessionId?: string) => {
      const ctx = await getContext()

      if (sessionId !== undefined) {
        if (!ctx.helpers.typedStore.tables.sessions.hasRow(sessionId)) {
          throw new Error(`Session not found: ${sessionId}`)
        }
        ctx.workspace.setActiveSessionId(sessionId)
      }

      const activeSessionId = ctx.workspace.getActiveSessionId()
      console.log(activeSessionId ?? '(none)')
    })

  // Resume is the friendly verb for setting active session state.
  program
    .command('resume <id>')
    .description('Set the active session')
    .action(async (sessionId: string) => {
      const ctx = await getContext()
      if (!ctx.helpers.typedStore.tables.sessions.hasRow(sessionId)) {
        throw new Error(`Session not found: ${sessionId}`)
      }
      ctx.workspace.setActiveSessionId(sessionId)
      console.log(sessionId)
    })

  // Delete a full session cascade: messages, requests, config, summaries, and hot generations.
  program
    .command('delete-session <id>')
    .alias('rm-session')
    .description('Delete a session')
    .action(async (sessionId: string) => {
      const ctx = await getContext()
      ctx.helpers.deleteSession(sessionId)
      if (ctx.workspace.getActiveSessionId() === sessionId) {
        ctx.workspace.clearActiveSessionId()
      }
      console.log(sessionId)
    })

  // Delete one message row and any hot generation row attached to it.
  program
    .command('delete-message <id>')
    .alias('rm-message')
    .description('Delete a message')
    .action(async (messageId: string) => {
      const ctx = await getContext()
      ctx.helpers.deleteMessage(messageId)
      console.log(messageId)
    })

  // Print history for a specific or active session.
  program
    .command('history')
    .argument('[id]', 'Session id, defaults to active')
    .description('Print message history')
    .action(async (sessionId?: string) => {
      const ctx = await getContext()
      const resolvedSessionId = sessionId ?? ctx.workspace.getActiveSessionId()
      if (resolvedSessionId === undefined) {
        throw new Error('No active session. Try: tetra "hello"')
      }
      const messages = ctx.helpers.typedIndexes
        .getSliceRowIds('messagesBySession', resolvedSessionId)
        .map((id) => ctx.helpers.typedStore.tables.messages.requireEntity(id))
      if (messages.length === 0) {
        console.log('No messages in this session.')
        return
      }
      printMessages(messages)
    })

  // Show or set the active session title.
  program
    .command('title')
    .argument('[title]', 'New title')
    .description('Show or rename the active session')
    .action(async (title?: string) => {
      const ctx = await getContext()
      const sessionId = ctx.workspace.getActiveSessionId()
      if (sessionId === undefined) {
        throw new Error('No active session. Try: tetra "hello"')
      }
      if (title !== undefined) {
        ctx.helpers.typedStore.tables.sessions.updateRow(sessionId, {
          title,
          updatedAt: Date.now(),
        })
      }
      console.log(
        ctx.helpers.typedStore.tables.sessions.requireEntity(sessionId).title ?? '(untitled)',
      )
    })
}
