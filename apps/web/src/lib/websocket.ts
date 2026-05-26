import ReconnectingWebSocket from 'reconnecting-websocket'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

export function createSyncWebSocket(workerUrl = WORKER_URL): WebSocket {
  if (workerUrl === undefined || workerUrl.trim() === '') {
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
