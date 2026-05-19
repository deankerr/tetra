import { loadSeeds } from '@tetra/core'
import type { Command } from 'commander'

import type { bootstrap } from '../bootstrap'

type CliContext = Awaited<ReturnType<typeof bootstrap>>

export function registerSeedCommand(program: Command, getContext: () => Promise<CliContext>): void {
  // Load bundled development sessions into the local SQLite database.
  program
    .command('seed')
    .description('Load bundled seed sessions into the local database')
    .action(async () => {
      const ctx = await getContext()
      loadSeeds(ctx.sessions)
      console.log('seeded')
    })
}
