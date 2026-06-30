import type { CredentialsStore } from '@tetra/credentials'
import type { LibraryDb, LibraryEntities, RunConfig } from '@tetra/schemas/library'

import { createIdGenerator } from '#ids'
import type { Prompts } from '#prompts'
import type { RunConfigs } from '#run-configs'
import type { Transcripts } from '#transcripts'

import { openRouterLanguageModelResolver } from './language-model-resolver.ts'
import type { LanguageModelResolver } from './language-model-resolver.ts'
import { Run } from './run.ts'
import type { RunStart } from './run.ts'

const nextRunId = createIdGenerator('run')

export interface GenerateArgs {
  targetMessageId: string
}

export interface RunsInit {
  credentials: CredentialsStore
  library: LibraryDb
  modelResolver?: LanguageModelResolver
  prompts: Prompts
  runConfigs: RunConfigs
  transcripts: Transcripts
}

export class Runs {
  private readonly active = new Map<string, Run>()
  private readonly credentials: CredentialsStore
  private readonly modelResolver: LanguageModelResolver
  private readonly prompts: Prompts
  private readonly runConfigs: RunConfigs
  private readonly transcripts: Transcripts
  private readonly library: LibraryDb

  constructor({
    credentials,
    library,
    modelResolver = openRouterLanguageModelResolver,
    prompts,
    runConfigs,
    transcripts,
  }: RunsInit) {
    this.credentials = credentials
    this.modelResolver = modelResolver
    this.prompts = prompts
    this.runConfigs = runConfigs
    this.transcripts = transcripts
    this.library = library
  }

  cancel(runId: string): void {
    this.active.get(runId)?.cancel()
  }

  get(runId: string): Run | null {
    return this.active.get(runId) ?? null
  }

  getByTargetMessage(messageId: string): Run | null {
    for (const run of this.active.values()) {
      if (run.targetMessageId === messageId) {
        return run
      }
    }

    return null
  }

  getBySession(sessionId: string): Run | null {
    for (const run of this.active.values()) {
      if (run.sessionId === sessionId) {
        return run
      }
    }

    return null
  }

  // Callers are responsible for creating transcript messages before calling generate.
  // The target starts empty and receives streaming snapshots until the run is terminal.
  generate(args: GenerateArgs): Run {
    const targetMessage = this.library.messages.require(args.targetMessageId)
    const session = this.library.sessions.require(targetMessage.sessionId)
    if (targetMessage.parts.length > 0) {
      throw new Error(`Cannot generate into a message with existing parts: ${args.targetMessageId}`)
    }

    // RunConfigs resolves the effective config from the session row (ADR-0008).
    const config = this.runConfigs.resolveForRun(session.id)
    const system = this.prompts.resolveContent(config.systemPromptId)
    const transcriptMessages = this.collectMessagesBefore(targetMessage, config)

    let runId = ''
    this.library.batch(() => {
      this.library.sessions.update(session.id, { updatedAt: Date.now() })
      runId = this.createRunRecord({
        config,
        sessionId: session.id,
        targetMessageId: args.targetMessageId,
      })
    })

    const runStart = {
      config,
      runId,
      session,
      targetMessageId: args.targetMessageId,
      transcriptMessages,
    }

    if (system === undefined) {
      return this.launchRun(runStart)
    }

    return this.launchRun({ ...runStart, system })
  }

  private collectMessagesBefore(
    targetMessage: LibraryEntities['messages'],
    config: RunConfig,
  ): LibraryEntities['messages'][] {
    const transcriptMessages = this.transcripts
      .getSession(targetMessage.sessionId)
      .getMessagePath({ messageId: targetMessage.parentMessageId })
      .messages()
    if (config.maxMessages === 0) {
      return transcriptMessages
    }

    return transcriptMessages.slice(-config.maxMessages)
  }

  private createRunRecord(args: {
    config: RunConfig
    sessionId: string
    targetMessageId: string
  }): string {
    const runId = nextRunId()
    const now = Date.now()

    // Run rows are durable status snapshots for one generation attempt.
    this.library.runs.create(runId, {
      config: args.config,
      createdAt: now,
      errorMessage: '',
      sessionId: args.sessionId,
      status: 'active',
      targetMessageId: args.targetMessageId,
      terminalAt: 0,
      updatedAt: now,
    })

    return runId
  }

  private launchRun(runStart: RunStart): Run {
    const run = new Run({
      credentials: this.credentials,
      library: this.library,
      modelResolver: this.modelResolver,
      start: runStart,
    })

    // Runs owns durable run-row status; Run owns the live stream and lifecycle events.
    run.addEventListener('finish', () => {
      this.completeRunRecord(run.runId)
    })
    run.addEventListener('cancel', () => {
      this.cancelRunRecord(run.runId, 'Run cancelled')
    })
    run.addEventListener('error', () => {
      this.failRunRecord(run.runId, run.error)
    })

    this.active.set(run.runId, run)
    void this.removeWhenDone(run)
    run.start()

    return run
  }

  private async removeWhenDone(run: Run): Promise<void> {
    await run.done
    this.active.delete(run.runId)
  }

  private completeRunRecord(runId: string): void {
    const now = Date.now()
    this.library.runs.update(runId, {
      status: 'completed',
      terminalAt: now,
      updatedAt: now,
    })
  }

  private cancelRunRecord(runId: string, message = ''): void {
    const now = Date.now()
    this.library.runs.update(runId, {
      errorMessage: message,
      status: 'cancelled',
      terminalAt: now,
      updatedAt: now,
    })
  }

  private failRunRecord(runId: string, error: unknown): void {
    const now = Date.now()
    this.library.runs.update(runId, {
      errorMessage: String(error),
      status: 'error',
      terminalAt: now,
      updatedAt: now,
    })
  }
}
