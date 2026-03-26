/**
 * TinyBase sync server — keeps a file-persisted copy of the core store
 * in sync with browser clients over WebSocket, and exposes it over HTTP.
 *
 * Usage: bun run server/sync.ts
 *
 * HTTP API (port 8049):
 *   GET /tables                     — all tables
 *   GET /table/:tableId             — all rows in a table
 *   GET /table/:tableId/:rowId      — single row
 *   GET /sessions                   — all sessions
 *   GET /messages/:sessionId        — messages for a session
 *   GET /requests/:sessionId        — requests for a session
 */
import { mkdirSync } from 'node:fs'
import type { Store } from 'tinybase'
import { createMergeableStore } from 'tinybase'
import { createFilePersister } from 'tinybase/persisters/persister-file'
import { createWsServer } from 'tinybase/synchronizers/synchronizer-ws-server'
import { WebSocketServer } from 'ws'

const WS_PORT = 8048
const HTTP_PORT = 8049
const DATA_DIR = './server/data'

mkdirSync(DATA_DIR, { recursive: true })

// Track stores by path so we can query them over HTTP
const stores = new Map<string, Store>()

const wss = new WebSocketServer({ port: WS_PORT })

const server = createWsServer(
  wss,
  (pathId) => {
    const safeName = pathId.replace(/[^a-zA-Z0-9-_]/g, '-') || 'default'
    const filePath = `${DATA_DIR}/${safeName}.json`
    const store = createMergeableStore()
    stores.set(safeName, store)
    console.log(`[sync] persisting path "${pathId}" → ${filePath}`)
    return createFilePersister(store, filePath)
  },
  (error) => console.error('[sync] error:', error),
)

server.addPathIdsListener((_server, pathId, addedOrRemoved) => {
  const action = addedOrRemoved === 1 ? 'opened' : 'closed'
  console.log(`[sync] path ${action}: "${pathId}"`)
})

server.addClientIdsListener(null, (_server, pathId) => {
  const count = _server.getClientIds(pathId).length
  console.log(`[sync] ${count} client(s) on "${pathId}"`)
})

// --- HTTP API ---

/** Get the default store (the one the browser client connects to) */
function getStore(): Store | undefined {
  return stores.get('default')
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Filter rows from a table by a cell value */
function filterRows(store: Store, tableId: string, filterCell: string, filterValue: string) {
  const table = store.getTable(tableId)
  const results: Record<string, unknown> = {}
  for (const [rowId, row] of Object.entries(table)) {
    if (row[filterCell] === filterValue) {
      results[rowId] = row
    }
  }
  return results
}

Bun.serve({
  port: HTTP_PORT,
  fetch(req) {
    const url = new URL(req.url)
    const parts = url.pathname.split('/').filter(Boolean)

    const store = getStore()
    if (!store) {
      return json({ error: 'store not synced yet' }, 503)
    }

    // GET /tables — all table names + row counts
    if (parts[0] === 'tables' && parts.length === 1) {
      const tableIds = store.getTableIds()
      const summary: Record<string, number> = {}
      for (const id of tableIds) {
        summary[id] = store.getRowIds(id).length
      }
      return json(summary)
    }

    // GET /table/:tableId — all rows
    // GET /table/:tableId/:rowId — single row
    if (parts[0] === 'table' && parts[1]) {
      const tableId = parts[1]
      if (parts[2]) {
        const row = store.getRow(tableId, parts[2])
        return Object.keys(row).length > 0 ? json(row) : json({ error: 'not found' }, 404)
      }
      return json(store.getTable(tableId))
    }

    // GET /sessions — all sessions, sorted by updatedAt desc
    if (parts[0] === 'sessions' && parts.length === 1) {
      const table = store.getTable('sessions')
      const sorted = Object.entries(table)
        .sort(([, a], [, b]) => Number(b.updatedAt) - Number(a.updatedAt))
        .map(([id, row]) => ({ id, ...row }))
      return json(sorted)
    }

    // GET /messages/:sessionId — messages for a session, sorted by seq
    if (parts[0] === 'messages' && parts[1]) {
      const rows = filterRows(store, 'messages', 'sessionId', parts[1])
      const sorted = Object.entries(rows)
        .sort(([, a], [, b]) => Number(a.seq) - Number(b.seq))
        .map(([id, row]) => ({ id, ...(row as Record<string, unknown>) }))
      return json(sorted)
    }

    // GET /requests/:sessionId — requests for a session
    if (parts[0] === 'requests' && parts[1]) {
      const rows = filterRows(store, 'requests', 'sessionId', parts[1])
      const sorted = Object.entries(rows)
        .sort(([, a], [, b]) => Number(b.createdAt) - Number(a.createdAt))
        .map(([id, row]) => ({ id, ...(row as Record<string, unknown>) }))
      return json(sorted)
    }

    return json({ error: 'not found', routes: ['/tables', '/table/:id', '/table/:id/:rowId', '/sessions', '/messages/:sessionId', '/requests/:sessionId'] }, 404)
  },
})

console.log(`[sync] ws://localhost:${WS_PORT}`)
console.log(`[http] http://localhost:${HTTP_PORT}`)
