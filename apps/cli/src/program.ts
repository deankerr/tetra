import { Command } from 'commander'

import type { CliAppContext } from './app'
import { registerChatCommands } from './commands/chat'
import { registerMessageCommands } from './commands/messages'
import { registerModelCommands } from './commands/models'
import { registerPromptCommands } from './commands/prompts'
import { registerSessionCommands } from './commands/sessions'

export interface CliProgramOptions {
  getContext: () => Promise<CliAppContext>
}

export function createCliProgram({ getContext }: CliProgramOptions): Command {
  const program = new Command()

  // The root action itself stays informational.
  program.name('tetra').description('Tetra CLI').version('0.1.0')
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

  return program
}
