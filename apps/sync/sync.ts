/**
 * TinyBase sync server — keeps a file-persisted copy of the core store
 * in sync with browser clients over WebSocket, and exposes it over HTTP
 * via @tetra/runtime DAOs.
 *
 * Usage: bun run --filter @tetra/sync start
 *
 * HTTP API (port 8049):
 *   GET /tables                     — all tables + row counts
 *   GET /sessions                   — all sessions, sorted by recency
 *   GET /sessions/:id               — single session
 *   GET /messages/:sessionId        — messages for a session, sorted by seq
 *   GET /requests/:sessionId        — requests for a session
 *   GET /table/:tableId             — raw table dump
 *   GET /table/:tableId/:rowId      — raw single row
 */
import { mkdirSync } from 'node:fs'

import { createRuntime } from '@tetra/runtime'
import type { Runtime } from '@tetra/runtime'
import type { MergeableStore, Store } from 'tinybase'
import { createMergeableStore } from 'tinybase'
import { createFilePersister } from 'tinybase/persisters/persister-file'
import { createWsServer } from 'tinybase/synchronizers/synchronizer-ws-server'
import { WebSocketServer } from 'ws'

const WS_PORT = 8048
const HTTP_PORT = 8049
const DATA_DIR = './data'

mkdirSync(DATA_DIR, { recursive: true })

// --- Runtime ---

const runtime = createRuntime({ runtimeId: 'sync-server' })

// File persistence
const persister = createFilePersister(
  // oxlint-disable-next-line no-unsafe-type-assertion -- schema-aware store is a superset of Store
  runtime.store as unknown as MergeableStore & Store,
  `${DATA_DIR}/default.json`,
)
await persister.startAutoLoad()
await persister.startAutoSave()

console.log('[sync] store loaded from disk')

// Start engine after persistence is loaded
runtime.start()

// --- WebSocket Sync ---

const wss = new WebSocketServer({ port: WS_PORT })

createWsServer(
  wss,
  (pathId) => {
    if (pathId === '/') {
      return persister
    }
    // Non-default paths get their own unmanaged store (fallback)
    const safeName = pathId.replaceAll(/[^a-zA-Z0-9-_]/g, '-')
    console.warn(`[sync] unexpected path "${pathId}", creating standalone store`)
    return createFilePersister(
      // oxlint-disable-next-line no-unsafe-type-assertion -- standalone fallback store
      createMergeableStore() as MergeableStore & Store,
      `${DATA_DIR}/${safeName}.json`,
    )
  },
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- createWsServer error handler, not a promise callback
  (error: unknown) => {
    console.error('[sync] error:', error)
  },
)

console.log(`[sync] ws://localhost:${WS_PORT}`)

// --- HTTP API ---

const TABLE_IDS = ['agents', 'messages', 'requests', 'sessions'] as const
type TableId = (typeof TABLE_IDS)[number]

const isTableId = (value: string): value is TableId => TABLE_IDS.some((t) => t === value)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

function handleRequest(rt: Runtime, parts: string[]) {
  const [route, id, extra] = parts

  // GET /tables — summary
  if (route === 'tables' && parts.length === 1) {
    const summary: Record<string, number> = {}
    for (const tid of TABLE_IDS) {
      summary[tid] = rt.store.getRowIds(tid).length
    }
    return json(summary)
  }

  // GET /sessions — all sessions, sorted by recency
  if (route === 'sessions' && id === undefined) {
    const ids = rt.sessions.listIdsByRecency()
    return json(ids.map((sid) => rt.sessions.get(sid)))
  }

  // GET /sessions/:id — single session
  if (route === 'sessions' && id !== undefined) {
    const session = rt.sessions.get(id)
    return session ? json(session) : json({ error: 'session not found' }, 404)
  }

  // GET /messages/:sessionId — messages for a session
  if (route === 'messages' && id !== undefined) {
    return json(rt.messages.listBySession(id))
  }

  // GET /requests/:sessionId — requests for a session
  if (route === 'requests' && id !== undefined) {
    const requestIds = rt.requests.listIdsBySession(id)
    return json(requestIds.map((rid) => rt.requests.get(rid)))
  }

  // GET /table/:tableId — raw table dump (escape hatch)
  // GET /table/:tableId/:rowId — raw single row
  if (route === 'table' && id !== undefined && isTableId(id)) {
    if (extra !== undefined) {
      const row = rt.store.getRow(id, extra)
      return Object.keys(row).length > 0 ? json(row) : json({ error: 'not found' }, 404)
    }
    return json(rt.store.getTable(id))
  }

  return json(
    {
      error: 'not found',
      routes: [
        '/tables',
        '/sessions',
        '/sessions/:id',
        '/messages/:sessionId',
        '/requests/:sessionId',
        '/table/:tableId',
        '/table/:tableId/:rowId',
      ],
    },
    404,
  )
}

Bun.serve({
  fetch(req) {
    const url = new URL(req.url)
    const parts = url.pathname.split('/').filter(Boolean)
    return handleRequest(runtime, parts)
  },
  port: HTTP_PORT,
})

console.log(`[http] http://localhost:${HTTP_PORT}`)
