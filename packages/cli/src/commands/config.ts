import { RequestConfig } from '@tetra/core-redesign'
import type { RequestConfigType } from '@tetra/core-redesign'
import type { Command } from 'commander'

import type { bootstrap } from '../bootstrap'

type CliContext = Awaited<ReturnType<typeof bootstrap>>

export function registerConfigCommand(
  program: Command,
  getContext: () => Promise<CliContext>,
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

        const overrides: Partial<RequestConfigType> = {
          ...(opts.maxMessages !== undefined && { maxMessages: opts.maxMessages }),
          ...(opts.model !== undefined && { modelId: opts.model }),
          ...(typeof opts.prompt === 'string' && { systemPromptId: opts.prompt }),
        }

        if (Object.keys(overrides).length > 0 || opts.prompt === false) {
          const next = { ...ctx.store.getSessionConfig(resolvedSessionId), ...overrides }
          if (opts.prompt === false) {
            delete next.systemPromptId
          }
          ctx.store.setSessionConfig(resolvedSessionId, RequestConfig.parse(next))
        }

        const config = ctx.store.getSessionConfig(resolvedSessionId)
        console.log(`session:      ${resolvedSessionId}`)
        console.log(`model:        ${config.modelId}`)
        console.log(`prompt:       ${config.systemPromptId ?? '(none)'}`)
        console.log(`maxMessages:  ${config.maxMessages ?? '(none)'}`)
      },
    )
}
