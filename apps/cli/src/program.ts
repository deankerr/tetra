import { Command } from 'commander'

import type { CliAppContext } from './app'
import { registerChatCommands } from './commands/chat'
import { registerMessageCommands } from './commands/messages'
import { registerModelCommands } from './commands/models'
import { registerPromptCommands } from './commands/prompts'
import { registerSessionCommands } from './commands/sessions'
import { registerSyncCommands } from './commands/sync'

export interface CliProgramContextOptions {
  syncLibrary?: boolean
}

export interface CliProgramOptions {
  getContext: (options?: CliProgramContextOptions) => Promise<CliAppContext>
}

export interface CliRootCommandOptions {
  sync?: boolean
}

export function createCliProgram({ getContext }: CliProgramOptions): Command {
  const program = new Command()

  // Root options belong to every command, while the root action itself stays informational.
  program.name('tetra').description('Tetra CLI').version('0.1.0')
  program.option('--no-sync', 'Disable optional remote sync')
  program.showHelpAfterError()
  program.action(() => {
    program.outputHelp()
  })

  // Register the noun-shaped command surface in one place for production and integration tests.
  registerChatCommands(program, getContext)
  registerSessionCommands(program, getContext)
  registerMessageCommands(program, getContext)
  registerPromptCommands(program, getContext)
  registerModelCommands(program, getContext)
  registerSyncCommands(program)

  return program
}
