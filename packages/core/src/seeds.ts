import type { RequestConfig as RequestConfigType, Rows } from '#db'
import { DEFAULT_REQUEST_CONFIG, RequestConfig } from '#db'
import type { Store } from '#store'

import tailwindV4Cheatsheet from './seeds/tailwind-v4-cheatsheet.json'

export interface SessionExport {
  config?: RequestConfigType
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
    config: store.getSessionConfig(sessionId),
    exportedAt: new Date().toISOString(),
    messages: store.listMessages(sessionId),
    requests: store.listRequestIds(sessionId).map((id) => store.getRequest(id)),
    session: store.getSession(sessionId),
  }
}

function importSession(
  store: Store,
  { config, messages, requests, session }: SessionExport,
): string {
  const sessionConfig = RequestConfig.safeParse(config).data ?? DEFAULT_REQUEST_CONFIG

  store.transaction(() => {
    store.db.store.setRow('sessions', session.id, {
      createdAt: session.createdAt,
      title: session.title,
      updatedAt: session.updatedAt,
    })

    store.db.store.setRow('sessionConfigs', session.id, {
      maxMessages: sessionConfig.maxMessages ?? 0,
      modelId: sessionConfig.modelId,
      providerOptions: sessionConfig.providerOptions ?? {},
      systemPromptId: sessionConfig.systemPromptId ?? '',
      toolIds: sessionConfig.toolIds ?? [],
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
