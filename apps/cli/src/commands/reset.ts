import type { Command } from 'commander'

import { WORKER_URL } from '../bootstrap'

function getResetUrl(): string {
  const url = new URL('/tetra/reset', WORKER_URL)
  if (url.protocol === 'ws:') {
    url.protocol = 'http:'
  }
  if (url.protocol === 'wss:') {
    url.protocol = 'https:'
  }
  return url.toString()
}

export function registerResetCommand(program: Command): void {
  program
    .command('reset-sync')
    .description('Clear the synced Durable Object store')
    .option('--yes', 'Confirm destructive reset')
    .action(async (opts: { yes?: boolean }) => {
      if (opts.yes !== true) {
        throw new Error('Refusing to reset synced data without --yes')
      }

      const response = await fetch(getResetUrl(), {
        method: 'DELETE',
      })
      if (!response.ok) {
        const body = await response.text()
        const detail = body.trim() === '' ? '' : `: ${body}`
        throw new Error(`Reset failed: ${response.status} ${response.statusText}${detail}`)
      }

      console.log(`Reset synced store at ${getResetUrl()}`)
    })
}
