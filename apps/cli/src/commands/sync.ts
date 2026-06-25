import type { Command } from 'commander'

interface ResetOptions {
  yes?: boolean
}

export function registerSyncCommands(program: Command): void {
  // Sync maintenance talks to the Worker directly and does not open local stores.
  const sync = program.command('sync').description('Manage remote sync')

  // Reset the remote library Durable Object through its maintenance endpoint.
  sync
    .command('reset')
    .description('Reset remote sync state')
    .requiredOption('--yes', 'Confirm destructive reset')
    .action(async (_options: ResetOptions) => {
      const workerUrl = getEnv('SYNC_WORKER_URL')
      if (workerUrl === undefined) {
        throw new Error('SYNC_WORKER_URL is required')
      }

      const url = new URL('/sync/reset', workerUrl)
      const response = await fetch(url, { method: 'DELETE' })
      if (!response.ok) {
        throw new Error(`Sync reset failed: ${response.status} ${response.statusText}`)
      }

      console.log('Remote sync state reset.')
    })
}

function getEnv(name: string): string | undefined {
  // Bun loads .env files automatically; empty strings are treated as absent.
  const value = process.env[name]?.trim()
  return value === undefined || value === '' ? undefined : value
}
