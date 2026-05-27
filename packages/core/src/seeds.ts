import type { RequestConfig as RequestConfigType, Rows } from '@tetra/store-schema'
import { DEFAULT_REQUEST_CONFIG, RequestConfig, StepRecord } from '@tetra/store-schema'
import { z } from 'zod'

import type { Helpers } from '#helpers'

import tailwindV4Cheatsheet from './seeds/tailwind-v4-cheatsheet.json'
import timeInNewYork from './seeds/time-in-new-york.json'

export interface SessionExport {
  sessionConfig: RequestConfigType
  exportedAt: string
  messages: PortableMessage[]
  requests: PortableRequest[]
  session: Rows['sessions']
  steps: Rows['steps'][]
}

type PortableMessage = Rows['messages']
type PortableRequest = Omit<Rows['requests'], 'updatedAt'> & {
  updatedAt?: Rows['requests']['updatedAt']
}
type PortableSessionExport = Omit<SessionExport, 'sessionConfig'> & {
  sessionConfig?: Partial<RequestConfigType>
}
const PortableStepRecord = StepRecord.extend({ id: z.string() })

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
  if (!helpers.typedStore.tables.sessions.hasRow(sessionId)) {
    throw new Error(`Session not found: ${sessionId}`)
  }

  return {
    exportedAt: new Date().toISOString(),
    messages: helpers.typedIndexes
      .getSliceRowIds('messagesBySession', sessionId)
      .map((id) => helpers.typedStore.tables.messages.requireEntity(id)),
    requests: helpers.typedIndexes
      .getSliceRowIds('requestsBySessionNewestFirst', sessionId)
      .map((id) => helpers.typedStore.tables.requests.requireEntity(id)),
    session: helpers.typedStore.tables.sessions.requireEntity(sessionId),
    sessionConfig: helpers.typedStore.tables.sessionConfigs.requireEntity(sessionId),
    steps: helpers.typedIndexes
      .getSliceRowIds('stepsBySession', sessionId)
      .map((id) => helpers.typedStore.tables.steps.requireEntity(id)),
  }
}

function importSession(
  helpers: Helpers,
  {
    sessionConfig: rawSessionConfig,
    messages,
    requests,
    session,
    steps,
  }: Loose<PortableSessionExport>,
): string {
  const sessionConfig = RequestConfig.parse({
    ...DEFAULT_REQUEST_CONFIG,
    ...rawSessionConfig,
  })

  helpers.rawStore.transaction(() => {
    helpers.typedStore.tables.sessions.setRow(session.id, {
      createdAt: session.createdAt,
      title: session.title,
      updatedAt: session.updatedAt,
    })

    helpers.typedStore.tables.sessionConfigs.setRow(session.id, sessionConfig)

    for (const message of messages) {
      helpers.typedStore.tables.messages.setRow(message.id, {
        createdAt: message.createdAt,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Loose<T> widens string fields for JSON import compatibility; data is validated by structure.
        parts: message.parts as unknown as Rows['messages']['parts'],
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Loose<T> widens string fields for JSON import compatibility; data is validated by structure.
        role: message.role as unknown as Rows['messages']['role'],
        sessionId: message.sessionId,
        updatedAt: message.updatedAt,
      })
    }

    for (const request of requests) {
      helpers.typedStore.tables.requests.setRow(request.id, {
        assistantMessageId: request.assistantMessageId,
        config: request.config,
        createdAt: request.createdAt,
        errorMessage: request.errorMessage,
        sessionId: request.sessionId,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Loose<T> widens string fields for JSON import compatibility; data is validated by structure.
        status: request.status as unknown as Rows['requests']['status'],
        terminalAt: request.terminalAt,
        updatedAt: request.updatedAt ?? request.terminalAt ?? request.createdAt,
      })
    }

    for (const step of parsePortableSteps(steps)) {
      helpers.typedStore.tables.steps.setRow(step.id, {
        cost: step.cost,
        createdAt: step.createdAt,
        finishReason: step.finishReason,
        generationId: step.generationId,
        messageId: step.messageId,
        model: step.model,
        provider: step.provider,
        raw: step.raw,
        requestId: step.requestId,
        sessionId: step.sessionId,
        stepNumber: step.stepNumber,
        usage: step.usage,
        warnings: step.warnings,
      })
    }
  })

  return session.id
}

function parsePortableSteps(value: unknown): Rows['steps'][] {
  return PortableStepRecord.array().parse(value)
}

export function loadSeeds(helpers: Helpers): void {
  for (const seed of bundledSeeds) {
    importSession(helpers, seed)
  }
}
