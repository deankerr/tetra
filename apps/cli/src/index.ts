import { Command } from 'commander'

import { bootstrap } from './bootstrap'
import { registerChatCommands } from './commands/chat'
import { registerConfigCommand } from './commands/config'
import { registerModelsCommand } from './commands/models'
import { registerPromptCommands } from './commands/prompts'
import { registerSessionCommands } from './commands/sessions'

const program = new Command()
program.name('tetra').description('Tetra CLI').version('0.1.0')

// Lazily bootstrap so pure help/version output does not create stores.
type CliContext = ReturnType<typeof bootstrap>

let context: CliContext | undefined
// eslint-disable-next-line require-await -- Command modules expect an async context provider while volatile store bootstrap is synchronous.
async function getContext(): Promise<CliContext> {
  context ??= bootstrap()
  return context
}

let closePromise: Promise<void> | undefined
async function saveAndClose() {
  // CLI processes are short-lived; close is a no-op while stores are volatile.
  if (context === undefined) {
    return
  }
  closePromise ??= context.close()
  await closePromise
}

process.once('SIGINT', () => {
  // Ctrl+C during streaming still needs to flush already-written TinyBase rows.
  void (async () => {
    try {
      await saveAndClose()
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
    } finally {
      process.exit(130)
    }
  })()
})

// Register command groups; the root command remains the primary chat surface.
registerChatCommands(program, getContext)
registerSessionCommands(program, getContext)
registerConfigCommand(program, getContext)
registerModelsCommand(program, getContext)
registerPromptCommands(program, getContext)

let exitCode = 0
try {
  // Commander routes subcommands first and falls back to the root chat action for messages.
  await program.parseAsync(process.argv)
} catch (error: unknown) {
  exitCode = 1
  console.error(error instanceof Error ? error.message : String(error))
} finally {
  await saveAndClose()
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}
