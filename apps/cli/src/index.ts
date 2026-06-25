import { Command } from 'commander'

import { createCliApp } from './app'
import type { CliAppContext } from './app'
import { registerChatCommands } from './commands/chat'
import { registerMessageCommands } from './commands/messages'
import { registerModelCommands } from './commands/models'
import { registerPromptCommands } from './commands/prompts'
import { registerSessionCommands } from './commands/sessions'
import { registerSyncCommands } from './commands/sync'

const program = new Command()
program.name('tetra').description('Tetra CLI').version('0.1.0')
program.option('--no-sync', 'Disable optional remote sync')
program.showHelpAfterError()

interface ProgramOptions {
  sync?: boolean
}

interface ContextOptions {
  syncLibrary?: boolean
}

// Keep store startup lazy so help, version, and sync maintenance commands stay cheap.
let context: CliAppContext | undefined
let contextPromise: Promise<CliAppContext> | undefined
async function getContext(options: ContextOptions = {}): Promise<CliAppContext> {
  if (context !== undefined) {
    return context
  }

  const opts = program.opts<ProgramOptions>()
  contextPromise ??= createCliApp({
    syncEnabled: opts.sync !== false && options.syncLibrary !== false,
  })
  context = await contextPromise
  return context
}

let closePromise: Promise<void> | undefined
async function saveAndClose(): Promise<void> {
  // A failed lazy startup should not mask the original command error.
  let ctx = context
  if (ctx === undefined && contextPromise !== undefined) {
    try {
      ctx = await contextPromise
    } catch {
      return
    }
  }

  // Help-only commands never create a context.
  if (ctx === undefined) {
    return
  }

  // Multiple exit paths may converge here after SIGINT or thrown command errors.
  closePromise ??= ctx.close()
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

// The root command is informational only; chat is intentionally explicit.
program.action(() => {
  program.outputHelp()
})

// Register the noun-shaped command surface.
registerChatCommands(program, getContext)
registerSessionCommands(program, getContext)
registerMessageCommands(program, getContext)
registerPromptCommands(program, getContext)
registerModelCommands(program, getContext)
registerSyncCommands(program)

let exitCode = 0
try {
  await program.parseAsync(process.argv)
} catch (error: unknown) {
  exitCode = 1
  console.error(error instanceof Error ? error.message : String(error))
} finally {
  try {
    await saveAndClose()
  } catch (error) {
    exitCode = 1
    console.error(error instanceof Error ? error.message : String(error))
  }
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}
