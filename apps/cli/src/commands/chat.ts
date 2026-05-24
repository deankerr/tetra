import type { RequestConfigType } from '@tetra/core'
import type { Command } from 'commander'

import type { bootstrap } from '../bootstrap'
import { readMessage } from '../lib/input'
import { resolveSession } from '../lib/session-ref'
import { titleFromMessage } from '../lib/title'
import { waitForRequest } from '../lib/wait-request'

type CliContext = Awaited<ReturnType<typeof bootstrap>>

interface ChatOptions {
  message?: string
  model?: string
  new?: boolean
  prompt?: false | string
  session?: string
  active?: boolean
}

async function runChat(ctx: CliContext, parts: string[], opts: ChatOptions): Promise<void> {
  // Gather the user's request from argv and stdin before touching session state.
  const content = await readMessage({ message: opts.message, parts })
  await runChatContent(ctx, content, opts)
}

export async function runChatContent(
  ctx: CliContext,
  content: string,
  opts: ChatOptions,
): Promise<void> {
  // Empty prompts are rejected at the execution boundary after all input modes are composed.
  if (content.trim() === '') {
    throw new Error('No message provided. Try: tetra "what should I build next?"')
  }

  // Resolve the target session according to explicit flags, active state, or auto-create.
  const sessionId = resolveSession(ctx, {
    forceNew: opts.new,
    sessionId: opts.session,
    setActive: opts.active !== false,
    title: titleFromMessage(content),
  })

  // Only pass per-request config fields that the user explicitly provided.
  const config: Partial<RequestConfigType> = {
    ...(opts.model !== undefined && { modelId: opts.model }),
    ...(typeof opts.prompt === 'string' && { systemPromptId: opts.prompt }),
  }
  if (opts.prompt === false) {
    config.systemPromptId = ''
  }

  // Create the user and assistant messages, then hand off to the run.
  ctx.helpers.appendMessage(sessionId, {
    parts: [{ text: content, type: 'text' }],
    role: 'user',
  })
  const assistantMessageId = ctx.helpers.appendMessage(sessionId, { parts: [], role: 'assistant' })

  // Stream new assistant text to stdout as UIMessage snapshots arrive.
  let lastLength = 0
  const run = ctx.runs.start({ assistantMessageId, config })
  run.addEventListener('snapshot', () => {
    const text = run.parts
      .filter((part): part is { text: string; type: 'text' } => part.type === 'text')
      .map((part) => part.text)
      .join('')
    process.stdout.write(text.slice(lastLength))
    lastLength = text.length
  })

  // Wait for the durable request row to reach a terminal status before exiting.
  await waitForRequest(run)
  console.log()
}

function addChatOptions(command: Command): Command {
  return command
    .option('--new', 'Force a new session')
    .option('--no-active', 'Do not update the active session')
    .option('-M, --model <modelId>', 'Model to use')
    .option('-m, --message <message>', 'Prompt prefix, useful with stdin')
    .option('-p, --prompt <promptId>', 'Stored system prompt id override')
    .option('-s, --session <sessionId>', 'Session id to use')
    .option('--no-prompt', 'Send without a system prompt')
}

export function registerChatCommands(
  program: Command,
  getContext: () => Promise<CliContext>,
): void {
  // The root command is the golden path: tetra "ask anything".
  addChatOptions(program.argument('[message...]', 'Message to send')).action(
    async (parts: string[], opts: ChatOptions) => {
      await runChat(await getContext(), parts, opts)
    },
  )

  // The explicit chat command mirrors the root command for scripts and discoverability.
  addChatOptions(
    program.command('chat').alias('c').argument('[message...]', 'Message to send'),
  ).action(async (parts: string[], opts: ChatOptions) => {
    await runChat(await getContext(), parts, opts)
  })
}
