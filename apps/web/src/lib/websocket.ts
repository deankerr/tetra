import ReconnectingWebSocket from 'reconnecting-websocket'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

export function hasSyncWorkerUrl(workerUrl = WORKER_URL): boolean {
  return workerUrl !== undefined && workerUrl.trim() !== ''
}

export function getSyncResetUrl(workerUrl = WORKER_URL): string {
  if (!hasSyncWorkerUrl(workerUrl)) {
    throw new Error('VITE_WORKER_URL is required to reset synced worker data')
  }

  // Convert the configured Worker origin into the reset endpoint URL.
  const url = new URL('/tetra/reset', workerUrl)
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
    const body = await response.text()
    const detail = body.trim() === '' ? '' : `: ${body}`
    throw new Error(
      `Failed to clear synced worker data: ${response.status} ${response.statusText}${detail}`,
    )
  }

  globalThis.location.reload()
}

export function createSyncWebSocket(workerUrl = WORKER_URL): WebSocket {
  if (!hasSyncWorkerUrl(workerUrl)) {
    throw new Error('VITE_WORKER_URL is required when VITE_TETRA_DATA_MODE=sync')
  }

  // Convert the configured Worker origin into the Durable Object websocket URL.
  const url = new URL('/tetra', workerUrl)
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
