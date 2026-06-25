import type { Command } from 'commander'

import type { CliAppContext } from '../app'

export function registerMessageCommands(
  program: Command,
  getContext: () => Promise<CliAppContext>,
): void {
  // Message commands operate on explicit message ids.
  const messages = program.command('messages').description('Manage messages')

  // Delete one leaf message through its owning transcript session.
  messages
    .command('delete <id>')
    .description('Delete a message')
    .action(async (messageId: string) => {
      const ctx = await getContext()
      const message = ctx.stores.library.typedStore.tables.messages.requireEntity(messageId)
      ctx.transcripts.getSession(message.sessionId).deleteMessage(messageId)
      console.log(messageId)
    })
}
