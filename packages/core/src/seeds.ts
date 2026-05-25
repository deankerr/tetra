import type { RequestConfig as RequestConfigType, Rows } from '#db'
import { DEFAULT_REQUEST_CONFIG, RequestConfig, StepRecord } from '#db'
import type { Helpers } from '#helpers'
import { deriveUsageSummary } from '#usage'

import tailwindV4Cheatsheet from './seeds/tailwind-v4-cheatsheet.json'
import timeInNewYork from './seeds/time-in-new-york.json'

export interface SessionExport {
  sessionConfig: RequestConfigType
  exportedAt: string
  messages: PortableMessage[]
  requests: PortableRequest[]
  session: Rows.Session
}

type PortableMessage = Omit<Rows.Message, 'usage'> & { usage?: Rows.Message['usage'] }
type PortableRequest = Omit<Rows.Request, 'updatedAt'> & { updatedAt?: Rows.Request['updatedAt'] }
type PortableSessionExport = Omit<SessionExport, 'sessionConfig'> & {
  sessionConfig?: Partial<RequestConfigType>
}

// JSON imports type all string fields as `string`, not specific string literal unions.
// This mapped type widens string fields to accept either, preserving structural checking.
type Loose<T> = T extends string
  ? string
  : T extends (infer U)[]
    ? Loose<U>[]
    : T extends object
      ? { [K in keyof T]: Loose<T[K]> }
      : T

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Bundled JSON is normalized and parsed during import; literal JSON inference is narrower than the portable export shape.
const bundledSeeds = [
  tailwindV4Cheatsheet,
  timeInNewYork,
] as unknown as Loose<PortableSessionExport>[]

export function exportSession(helpers: Helpers, sessionId: string): SessionExport {
  if (!helpers.db.tables.sessions.hasRow(sessionId)) {
    throw new Error(`Session not found: ${sessionId}`)
  }

  return {
    exportedAt: new Date().toISOString(),
    messages: helpers.db.indexes
      .getSliceRowIds('messagesBySession', sessionId)
      .map((id) => helpers.db.tables.messages.requireEntity(id)),
    requests: helpers.db.indexes
      .getSliceRowIds('requestsBySessionNewestFirst', sessionId)
      .map((id) => helpers.db.tables.requests.requireEntity(id)),
    session: helpers.db.tables.sessions.requireEntity(sessionId),
    sessionConfig: helpers.db.tables.sessionConfigs.requireEntity(sessionId),
  }
}

function importSession(
  helpers: Helpers,
  { sessionConfig: rawSessionConfig, messages, requests, session }: Loose<PortableSessionExport>,
): string {
  const sessionConfig = RequestConfig.parse({
    ...DEFAULT_REQUEST_CONFIG,
    ...rawSessionConfig,
  })

  helpers.db.store.transaction(() => {
    helpers.db.tables.sessions.setRow(session.id, {
      createdAt: session.createdAt,
      title: session.title,
      updatedAt: session.updatedAt,
    })

    helpers.db.tables.sessionConfigs.setRow(session.id, sessionConfig)

    helpers.db.tables.sessionSummaries.setRow(session.id, {
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      usage: {},
    })

    for (const message of messages) {
      const steps = parsePortableSteps(message.steps)
      helpers.db.tables.messages.setRow(message.id, {
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
      helpers.db.tables.requests.setRow(request.id, {
        assistantMessageId: request.assistantMessageId,
        config: request.config,
        createdAt: request.createdAt,
        errorMessage: request.errorMessage,
        sessionId: request.sessionId,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Loose<T> widens string fields for JSON import compatibility; data is validated by structure.
        status: request.status as unknown as Rows.Request['status'],
        terminalAt: request.terminalAt,
        updatedAt: request.updatedAt ?? request.terminalAt ?? request.createdAt,
      })
    }

    helpers.rebuildSessionUsage(session.id)
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

export function loadSeeds(helpers: Helpers): void {
  for (const seed of bundledSeeds) {
    importSession(helpers, seed)
  }
}
