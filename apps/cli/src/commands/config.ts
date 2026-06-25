import type { RunConfig } from '@tetra/core'
import type { Command } from 'commander'

import type { CliAppContext } from '../app'

export function registerConfigCommand(
  program: Command,
  getContext: () => Promise<CliAppContext>,
): void {
  // Show or update inference config for a specific session, defaulting to active.
  program
    .command('config')
    .argument('[id]', 'Session id, defaults to active')
    .description('Show or update session config')
    .option('-M, --model <modelId>', 'Model to use')
    .option('-n, --max-messages <n>', 'Max messages for context window', Number.parseInt)
    .option('-p, --prompt <promptId>', 'Stored system prompt id')
    .option('--no-prompt', 'Clear the stored system prompt')
    .action(
      async (
        sessionId: string | undefined,
        opts: { maxMessages?: number; model?: string; prompt?: false | string },
      ) => {
        const ctx = await getContext()
        const resolvedSessionId = sessionId ?? ctx.workspace.getActiveSessionId()
        if (resolvedSessionId === undefined) {
          throw new Error('No active session. Try: tetra "hello"')
        }

        // Apply any flag-derived fields through the validated config merge.
        const overrides: Partial<RunConfig> = {
          ...(opts.maxMessages !== undefined && { maxMessages: opts.maxMessages }),
          ...(opts.model !== undefined && { modelId: opts.model }),
          ...(typeof opts.prompt === 'string' && { systemPromptId: opts.prompt }),
          ...(opts.prompt === false && { systemPromptId: '' }),
        }
        if (Object.keys(overrides).length > 0) {
          ctx.runConfigs.update(resolvedSessionId, overrides)
        }

        const latestConfig =
          ctx.stores.library.typedStore.tables.sessionRunConfigs.requireEntity(resolvedSessionId)
        console.log(`session:      ${resolvedSessionId}`)
        console.log(`model:        ${latestConfig.modelId}`)
        console.log(
          `prompt:       ${latestConfig.systemPromptId === '' ? '(none)' : latestConfig.systemPromptId}`,
        )
        console.log(
          `maxMessages:  ${latestConfig.maxMessages === 0 ? '(none)' : latestConfig.maxMessages}`,
        )
      },
    )
}
