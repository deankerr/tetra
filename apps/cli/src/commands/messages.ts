import type { Command } from 'commander'

import type { CliAppContext } from '../app'
import { readTextArgument, resolveSessionId } from './shared'

interface AddOptions {
  session?: string
}

export function registerMessageCommands(
  program: Command,
  getContext: () => Promise<CliAppContext>,
): void {
  // Message commands operate on explicit message ids.
  const messages = program.command('messages').description('Manage messages')

  // Add one user-authored message without creating an assistant target or run.
  messages
    .command('add')
    .argument('[message...]', 'Message to add, or "-" to read stdin')
    .option('-s, --session <sessionId>', 'Session id to use, defaults to active')
    .description('Add a message without starting a run')
    .action(async (parts: string[], options: AddOptions) => {
      // Resolve text and target session before mutating transcript state.
      const ctx = await getContext()
      const sessionId = resolveSessionId(ctx, options.session)
      const content = await readTextArgument(parts)
      if (content.trim() === '') {
        throw new Error('No message provided. Try: tetra messages add --session <id> "hello"')
      }

      // Append at the newest leaf, matching chat without creating the assistant/run pair.
      const session = ctx.transcripts.getSession(sessionId)
      const messageId = session.appendMessage({
        parentMessageId: session.getNewestLeafMessageId(),
        parts: [{ text: content, type: 'text' }],
        role: 'user',
      })
      console.log(messageId)
    })

  // Delete one leaf message through its owning transcript session.
  messages
    .command('delete <id>')
    .description('Delete a message')
    .action(async (messageId: string) => {
      const ctx = await getContext()
      const message = ctx.stores.library.messages.require(messageId)
      ctx.transcripts.getSession(message.sessionId).deleteMessage(messageId)
      console.log(messageId)
    })
}
