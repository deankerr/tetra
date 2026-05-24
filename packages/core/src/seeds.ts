import type { RequestConfig as RequestConfigType, Rows } from '#db'
import {
  DEFAULT_REQUEST_CONFIG,
  RequestConfig,
  StepRecord,
  deriveUsageSummary,
  requestConfigToSessionConfigRow,
  sessionConfigRowToRequestConfig,
} from '#db'
import type { Store } from '#store'

import tailwindV4Cheatsheet from './seeds/tailwind-v4-cheatsheet.json'
import timeInNewYork from './seeds/time-in-new-york.json'

export interface SessionExport {
  sessionConfig?: RequestConfigType
  exportedAt: string
  messages: PortableMessage[]
  requests: Rows.Request[]
  session: Rows.Session
}

type PortableMessage = Omit<Rows.Message, 'usage'> & { usage?: Rows.Message['usage'] }

// JSON imports type all string fields as `string`, not specific string literal unions.
// This mapped type widens string fields to accept either, preserving structural checking.
type Loose<T> = T extends string
  ? string
  : T extends (infer U)[]
    ? Loose<U>[]
    : T extends object
      ? { [K in keyof T]: Loose<T[K]> }
      : T

const bundledSeeds: Loose<SessionExport>[] = [tailwindV4Cheatsheet, timeInNewYork]

export function exportSession(store: Store, sessionId: string): SessionExport {
  if (!store.db.tables.sessions.hasRow(sessionId)) {
    throw new Error(`Session not found: ${sessionId}`)
  }

  return {
    exportedAt: new Date().toISOString(),
    messages: store.db.indexes
      .getSliceRowIds('messagesBySession', sessionId)
      .map((id) => store.db.tables.messages.requireEntity(id)),
    requests: store.db.indexes
      .getSliceRowIds('requestsBySession', sessionId)
      .map((id) => store.db.tables.requests.requireEntity(id)),
    session: store.db.tables.sessions.requireEntity(sessionId),
    sessionConfig: sessionConfigRowToRequestConfig(
      store.db.tables.sessionConfigs.requireEntity(sessionId),
    ),
  }
}

function importSession(
  store: Store,
  { sessionConfig: rawSessionConfig, messages, requests, session }: Loose<SessionExport>,
): string {
  const sessionConfig = RequestConfig.safeParse(rawSessionConfig).data ?? DEFAULT_REQUEST_CONFIG

  store.db.transaction(() => {
    store.db.tables.sessions.setRow(session.id, {
      createdAt: session.createdAt,
      title: session.title,
      updatedAt: session.updatedAt,
    })

    store.db.tables.sessionConfigs.setRow(
      session.id,
      requestConfigToSessionConfigRow(sessionConfig),
    )

    store.db.tables.sessionSummaries.setRow(session.id, {
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      usage: {},
    })

    for (const message of messages) {
      const steps = parsePortableSteps(message.steps)
      store.db.tables.messages.setRow(message.id, {
        createdAt: message.createdAt,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Loose<T> widens string fields for JSON import compatibility; data is validated by structure.
        parts: message.parts as unknown as Rows.Message['parts'],
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Loose<T> widens string fields for JSON import compatibility; data is validated by structure.
        role: message.role as unknown as Rows.Message['role'],
        sessionId: message.sessionId,
        steps,
        updatedAt: message.updatedAt,
        usage: deriveUsageSummary(steps),
      })
    }

    for (const request of requests) {
      store.db.tables.requests.setRow(request.id, {
        assistantMessageId: request.assistantMessageId,
        config: request.config,
        createdAt: request.createdAt,
        errorMessage: request.errorMessage,
        sessionId: request.sessionId,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Loose<T> widens string fields for JSON import compatibility; data is validated by structure.
        status: request.status as unknown as Rows.Request['status'],
        terminalAt: request.terminalAt,
      })
    }

    store.rebuildSessionUsage(session.id)
  })

  return session.id
}

function parsePortableSteps(value: unknown): Rows.Message['steps'] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((step) => StepRecord.safeParse(step).data)
    .filter((step): step is Rows.Message['steps'][number] => step !== undefined)
}

export function loadSeeds(store: Store): void {
  for (const seed of bundledSeeds) {
    importSession(store, seed)
  }
}
