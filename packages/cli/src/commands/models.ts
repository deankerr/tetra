import type { Command } from 'commander'

import type { bootstrap } from '../bootstrap'

type CliContext = Awaited<ReturnType<typeof bootstrap>>

export function registerModelsCommand(
  program: Command,
  getContext: () => Promise<CliContext>,
): void {
  // Refresh and list text-output models from OpenRouter.
  program
    .command('models')
    .description('List available models from OpenRouter')
    .option('-p, --provider <name>', 'Filter by provider name')
    .action(async (opts: { provider?: string }) => {
      const ctx = await getContext()
      await ctx.models.refresh({ force: true })

      const rows = Object.entries(ctx.store.getTable('languageModels'))
        .map(([id, row]) => ({
          contextLength: row.contextLength,
          createdAt: row.createdAt,
          id,
          inputModalities: row.inputModalities.split(',').filter(Boolean),
          name: row.name,
          outputModalities: row.outputModalities.split(',').filter(Boolean),
          provider: row.providerName || row.provider,
        }))
        .filter((row) => row.outputModalities.includes('text'))
        .filter(
          (row) =>
            opts.provider === undefined ||
            row.provider.toLowerCase().includes(opts.provider.toLowerCase()),
        )
        .toSorted((a, b) => b.createdAt - a.createdAt)

      if (rows.length === 0) {
        console.log('No models found.')
        return
      }

      for (const row of rows) {
        const contextLength =
          row.contextLength > 0 ? `${(row.contextLength / 1000).toFixed(0)}k` : '?'
        const inputModalities = row.inputModalities.join('+') || 'text'
        console.log(
          `${row.id.padEnd(55)} ${row.name.padEnd(45)} ctx:${contextLength.padStart(5)}  in:${inputModalities}`,
        )
      }
    })
}
