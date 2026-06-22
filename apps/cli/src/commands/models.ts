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
      await ctx.catalog.refresh({ force: true })
      const providerQuery = opts.provider?.toLowerCase()

      const rows = ctx.catalogStore.tables.languageModels
        .listEntities()
        .filter((row) => row.outputModalities.includes('text'))
        .filter((row) => {
          if (providerQuery === undefined) {
            return true
          }

          return (
            row.providerName.toLowerCase().includes(providerQuery) ||
            row.provider.toLowerCase().includes(providerQuery)
          )
        })
        .toSorted((a, b) => b.upstreamCreatedAt - a.upstreamCreatedAt)

      if (rows.length === 0) {
        console.log('No models found.')
        return
      }

      for (const row of rows) {
        const contextLength =
          row.contextLength > 0 ? `${(row.contextLength / 1000).toFixed(0)}k` : '?'
        const inputModalities = row.inputModalities.join('+') ?? 'text'
        console.log(
          `${row.id.padEnd(55)} ${row.name.padEnd(45)} ctx:${contextLength.padStart(5)}  in:${inputModalities}`,
        )
      }
    })
}
