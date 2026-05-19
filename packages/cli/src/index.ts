import { Command } from 'commander'

import { bootstrap } from './bootstrap'
import { registerChatCommands } from './commands/chat'
import { registerConfigCommand } from './commands/config'
import { registerModelsCommand } from './commands/models'
import { registerPromptCommands } from './commands/prompts'
import { registerSeedCommand } from './commands/seed'
import { registerSessionCommands } from './commands/sessions'

const program = new Command()
program.name('tetra').description('Tetra CLI').version('0.1.0')

// Lazily bootstrap so pure help/version output does not open the database.
let context: Awaited<ReturnType<typeof bootstrap>> | undefined
async function getContext() {
  context ??= await bootstrap()
  return context
}

let closePromise: Promise<void> | undefined
async function saveAndClose() {
  // CLI processes are short-lived, so flush TinyBase manually instead of relying on auto-save.
  if (context === undefined) {
    return
  }
  closePromise ??= (async () => {
    const ctx = context
    if (ctx === undefined) {
      return
    }
    await ctx.persister.save()
    await ctx.persister.destroy()
    ctx.db.close()
  })()
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
registerSeedCommand(program, getContext)

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
