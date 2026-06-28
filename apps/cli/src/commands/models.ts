import type { Command } from 'commander'

import type { CliAppContext } from '../app'

interface ModelListOptions {
  provider?: string
}

export function registerModelCommands(
  program: Command,
  getContext: (options?: { syncLibrary?: boolean }) => Promise<CliAppContext>,
): void {
  // Model commands read and refresh the local OpenRouter catalog cache.
  const models = program.command('models').description('Manage model catalog')

  // List cached text-output models.
  models
    .command('list')
    .description('List cached models')
    .option('-p, --provider <name>', 'Filter by provider name')
    .action(async (options: ModelListOptions) => {
      const ctx = await getContext({ syncLibrary: false })
      const providerQuery = options.provider?.toLowerCase()
      const rows = ctx.stores.catalog.boundStore.tables.languageModels
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
        console.log('No cached models. Run: tetra models refresh')
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

  // Refresh the catalog cache from OpenRouter.
  models
    .command('refresh')
    .description('Refresh models from OpenRouter')
    .action(async () => {
      const ctx = await getContext({ syncLibrary: false })
      await ctx.modelCatalog.refresh({ force: true })
      const count = ctx.stores.catalog.boundStore.tables.languageModels.getRowIds().length
      console.log(`Refreshed ${count} models.`)
    })
}
