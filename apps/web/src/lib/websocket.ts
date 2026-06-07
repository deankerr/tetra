import ReconnectingWebSocket from 'reconnecting-websocket'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

function getSyncWorkerUrl(): string {
  const workerUrl = WORKER_URL?.trim()
  if (workerUrl === undefined || workerUrl === '') {
    throw new Error('VITE_WORKER_URL is required for Cloudflare sync')
  }

  return workerUrl
}

function getSyncResetUrl(): string {
  // Convert the configured Worker origin into the reset endpoint URL.
  const url = new URL('/tetra/reset', getSyncWorkerUrl())
  if (url.protocol === 'ws:') {
    url.protocol = 'http:'
  }
  if (url.protocol === 'wss:') {
    url.protocol = 'https:'
  }

  return url.toString()
}

export async function clearTetraSyncDataAndReload(): Promise<void> {
  const response = await fetch(getSyncResetUrl(), {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(`Failed to clear synced worker data: ${response.status} ${response.statusText}`)
  }

  globalThis.location.reload()
}

export function createSyncWebSocket(): WebSocket {
  // Convert the configured Worker origin into the Durable Object websocket URL.
  const url = new URL('/tetra', getSyncWorkerUrl())
  if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }
  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  }

  // TinyBase accepts WebSocket-compatible clients but its type only names native WebSocket.
  // oxlint-disable-next-line no-unsafe-type-assertion
  return new ReconnectingWebSocket(url.toString()) as unknown as WebSocket
}
