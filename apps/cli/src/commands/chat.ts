import type { Command } from 'commander'

import type { CliAppContext } from '../app'
import { readTextArgument, requireSession, resolveSessionId, waitForRun } from './shared'

interface ChatOptions {
  session?: string
}

export function registerChatCommands(
  program: Command,
  getContext: () => Promise<CliAppContext>,
): void {
  // Chat is explicit and only sends a message to an existing session.
  program
    .command('chat')
    .argument('[message...]', 'Message to send, or "-" to read stdin')
    .option('-s, --session <sessionId>', 'Session id to use, defaults to active')
    .description('Send a message in a session')
    .action(async (parts: string[], options: ChatOptions) => {
      const ctx = await getContext()
      const sessionId = resolveSessionId(ctx, options.session)
      const content = await readTextArgument(parts)
      await runChat(ctx, sessionId, content)
    })
}

async function runChat(ctx: CliAppContext, sessionId: string, content: string): Promise<void> {
  // Empty prompts are rejected after argv/stdin composition.
  if (content.trim() === '') {
    throw new Error('No message provided. Try: tetra chat --session <id> "hello"')
  }

  // Resolve the target session and append a user/assistant pair at the newest leaf.
  requireSession(ctx, sessionId)
  const session = ctx.transcripts.getSession(sessionId)
  const parentMessageId = session.getNewestLeafMessageId()
  const userMessageId = session.appendMessage({
    parentMessageId,
    parts: [{ text: content, type: 'text' }],
    role: 'user',
  })
  const targetMessageId = session.appendMessage({
    parentMessageId: userMessageId,
    parts: [],
    role: 'assistant',
  })

  // Stream assistant text to stdout as snapshots arrive.
  let lastLength = 0
  const run = ctx.runs.generate({ targetMessageId })
  run.addEventListener('snapshot', () => {
    const text = run.parts
      .filter((part): part is { text: string; type: 'text' } => part.type === 'text')
      .map((part) => part.text)
      .join('')
    process.stdout.write(text.slice(lastLength))
    lastLength = text.length
  })

  // Wait for terminal status before saving and exiting.
  await waitForRun(run)
  console.log()
}
