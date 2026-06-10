import type { CredentialsStore } from '@tetra/credentials'
import { DEFAULT_RUN_CONFIG, RunConfigSchema } from '@tetra/store-schema'
import type {
  RunConfig as RunConfigType,
  Rows,
  TetraRawStore,
  TetraTypedStore,
} from '@tetra/store-schema'

import type { Transcripts } from '#transcripts'

import { openRouterLanguageModelResolver } from './language-model-resolver.ts'
import type { LanguageModelResolver } from './language-model-resolver.ts'
import { createRunRecord, failRunRecord } from './run-records.ts'
import { Run } from './run.ts'
import type { RunStart } from './run.ts'

export interface GenerateArgs {
  config?: Partial<RunConfigType>
  targetMessageId: string
}

export interface RunsInit {
  credentials: CredentialsStore
  modelResolver?: LanguageModelResolver
  rawStore: TetraRawStore
  transcripts: Transcripts
  typedStore: TetraTypedStore
}

export class Runs {
  private readonly active = new Map<string, Run>()
  private readonly credentials: CredentialsStore
  private readonly modelResolver: LanguageModelResolver
  private readonly rawStore: TetraRawStore
  private readonly transcripts: Transcripts
  private readonly typedStore: TetraTypedStore

  constructor({
    credentials,
    modelResolver = openRouterLanguageModelResolver,
    rawStore,
    transcripts,
    typedStore,
  }: RunsInit) {
    this.credentials = credentials
    this.modelResolver = modelResolver
    this.rawStore = rawStore
    this.transcripts = transcripts
    this.typedStore = typedStore
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

  recover(): void {
    this.failInterruptedRuns()
    this.commitInterruptedStreamingParts()
  }

  // Callers are responsible for creating transcript messages before calling generate.
  // The target message should have empty parts; all messages before it become the transcript.
  generate(args: GenerateArgs): Run {
    const targetMessage = this.typedStore.tables.messages.requireEntity(args.targetMessageId)
    const session = this.typedStore.tables.sessions.requireEntity(targetMessage.sessionId)
    if (targetMessage.parts.length > 0) {
      throw new Error(
        `Cannot generate into a message with committed parts: ${args.targetMessageId}`,
      )
    }

    // Read the raw config row so the default merge remains tolerant of missing cells.
    const sessionRunConfig = this.rawStore.getRow('sessionRunConfigs', session.id)
    const config = RunConfigSchema.parse({
      ...DEFAULT_RUN_CONFIG,
      ...sessionRunConfig,
      ...args.config,
    })
    const system = this.requireSystemPrompt(config)
    const transcriptMessages = this.collectMessagesBefore(targetMessage, config)

    let runId = ''
    this.typedStore.transaction(() => {
      this.typedStore.tables.sessions.setCell(session.id, 'updatedAt', Date.now())
      runId = createRunRecord(this.typedStore, {
        config,
        sessionId: session.id,
        targetMessageId: args.targetMessageId,
      })
    })

    return this.launchRun({
      config,
      runId,
      session,
      system,
      targetMessageId: args.targetMessageId,
      transcriptMessages,
    })
  }

  private collectMessagesBefore(
    targetMessage: Rows['messages'],
    config: RunConfigType,
  ): Rows['messages'][] {
    const transcriptMessages = this.transcripts
      .getSession(targetMessage.sessionId)
      .getMessagePath({ messageId: targetMessage.parentMessageId })
      .messages()
    if (config.maxMessages === 0) {
      return transcriptMessages
    }

    return transcriptMessages.slice(-config.maxMessages)
  }

  private commitInterruptedStreamingParts(): void {
    for (const messageId of this.typedStore.tables.streamingMessageParts.getRowIds()) {
      const streamingParts = this.typedStore.tables.streamingMessageParts.requireEntity(messageId)

      this.typedStore.tables.messages.updateRow(messageId, {
        parts: streamingParts.parts,
        updatedAt: Date.now(),
      })
      this.typedStore.tables.streamingMessageParts.deleteRow(messageId)
    }
  }

  private failInterruptedRuns(message = 'Run interrupted'): void {
    for (const runId of this.typedStore.tables.runs.getRowIds()) {
      const status = this.typedStore.tables.runs.getCell(runId, 'status')
      if (status === 'preparing' || status === 'streaming') {
        failRunRecord(this.typedStore, runId, message)
      }
    }
  }

  private launchRun(runStart: RunStart): Run {
    const run = new Run({
      credentials: this.credentials,
      modelResolver: this.modelResolver,
      start: runStart,
      typedStore: this.typedStore,
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

  private requireSystemPrompt(config: RunConfigType): string | undefined {
    if (config.systemPromptId === '') {
      return undefined
    }

    const prompt = this.typedStore.tables.prompts.requireEntity(config.systemPromptId)
    return prompt.content
  }
}
