import type { Rows } from '#db'
import { RequestConfig } from '#db'
import type { Store } from '#store'

import tailwindV4Cheatsheet from './seeds/tailwind-v4-cheatsheet.json'

export interface SessionExport {
  exportedAt: string
  messages: Rows.Message[]
  requests: Rows.Request[]
  session: Rows.Session
}

const bundledSeeds: SessionExport[] = [
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON structure matches the portable session export shape.
  tailwindV4Cheatsheet as unknown as SessionExport,
]

export function exportSession(store: Store, sessionId: string): SessionExport {
  if (!store.sessionExists(sessionId)) {
    throw new Error(`Session not found: ${sessionId}`)
  }

  return {
    exportedAt: new Date().toISOString(),
    messages: store.listMessages(sessionId),
    requests: store.listRequestIds(sessionId).map((id) => store.getRequest(id)),
    session: store.getSession(sessionId),
  }
}

function importSession(store: Store, { messages, requests, session }: SessionExport): string {
  store.transaction(() => {
    store.db.store.setRow('sessions', session.id, {
      config: RequestConfig.parse(session.config),
      createdAt: session.createdAt,
      title: session.title,
      updatedAt: session.updatedAt,
    })

    for (const message of messages) {
      store.db.store.setRow('messages', message.id, {
        createdAt: message.createdAt,
        parts: message.parts,
        role: message.role,
        sessionId: message.sessionId,
        updatedAt: message.updatedAt,
      })
    }

    for (const request of requests) {
      store.db.store.setRow('requests', request.id, {
        assistantMessageId: request.assistantMessageId,
        config: RequestConfig.parse(request.config),
        createdAt: request.createdAt,
        errorMessage: request.errorMessage,
        sessionId: request.sessionId,
        status: request.status,
        steps: request.steps,
        terminalAt: request.terminalAt,
      })
    }
  })

  return session.id
}

export function loadSeeds(store: Store): void {
  for (const seed of bundledSeeds) {
    importSession(store, seed)
  }
}
