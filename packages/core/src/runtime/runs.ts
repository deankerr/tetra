import { DEFAULT_RUN_CONFIG, RunConfigSchema } from '@tetra/store-schema'
import type { RunConfig as RunConfigType, Rows } from '@tetra/store-schema'

import type { Helpers } from '#helpers'

import { createRunRecord, failRunRecord } from './run-records.ts'
import { Run, openRouterLanguageModelResolver } from './run.ts'
import type { CredentialReader, LanguageModelResolver, RunStart } from './run.ts'

export interface StartArgs {
  assistantMessageId: string
  config?: Partial<RunConfigType>
}

export interface RegenerateArgs {
  config?: Partial<RunConfigType>
  messageId: string
}

export class Runs {
  private readonly active = new Map<string, Run>()
  private readonly credentials: CredentialReader
  private readonly modelResolver: LanguageModelResolver
  private readonly helpers: Helpers

  constructor(
    helpers: Helpers,
    credentials: CredentialReader,
    modelResolver: LanguageModelResolver = openRouterLanguageModelResolver,
  ) {
    this.credentials = credentials
    this.modelResolver = modelResolver
    this.helpers = helpers
  }

  cancel(runId: string): void {
    this.active.get(runId)?.cancel()
  }

  get(runId: string): Run | null {
    return this.active.get(runId) ?? null
  }

  getByAssistantMessage(messageId: string): Run | null {
    for (const run of this.active.values()) {
      if (run.assistantMessageId === messageId) {
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

  // Re-run the final conversation turn by reusing an assistant tail or appending one after a user tail.
  regenerate(args: RegenerateArgs): Run {
    const message = this.helpers.typedStore.tables.messages.requireEntity(args.messageId)
    const messages = this.helpers.typedIndexes
      .getSliceRowIds('messagesBySession', message.sessionId)
      .map((id) => this.helpers.typedStore.tables.messages.requireEntity(id))
    const lastMessage = messages.at(-1)
    if (lastMessage?.id !== message.id) {
      throw new Error('Only the last message in a conversation can be regenerated')
    }

    if (this.getBySession(message.sessionId) !== null) {
      throw new Error('A run is already active for this conversation')
    }

    if (message.role === 'assistant') {
      this.clearAssistantMessageForRegeneration(message.id)
      return this.start({ assistantMessageId: message.id, config: args.config })
    }

    const assistantMessageId = this.helpers.appendMessage(message.sessionId, {
      parts: [],
      role: 'assistant',
    })
    return this.start({ assistantMessageId, config: args.config })
  }

  // Callers are responsible for creating the user and assistant messages before calling start.
  // The assistant message should have empty parts; all messages before it become the transcript.
  start(args: StartArgs): Run {
    const assistantMessage = this.helpers.typedStore.tables.messages.requireEntity(
      args.assistantMessageId,
    )
    const session = this.helpers.typedStore.tables.sessions.requireEntity(
      assistantMessage.sessionId,
    )
    const sessionRunConfig = this.helpers.rawStore.getRow('sessionRunConfigs', session.id)
    const config = RunConfigSchema.parse({
      ...DEFAULT_RUN_CONFIG,
      ...sessionRunConfig,
      ...args.config,
    })
    const system = this.requireSystemPrompt(config)
    const transcriptMessages = this.collectMessagesBefore(args.assistantMessageId, config)

    let runId = ''
    this.helpers.rawStore.transaction(() => {
      this.helpers.typedStore.tables.sessions.setCell(session.id, 'updatedAt', Date.now())
      runId = createRunRecord(this.helpers.typedStore, {
        assistantMessageId: args.assistantMessageId,
        config,
        sessionId: session.id,
      })
    })

    return this.launchRun({
      assistantMessageId: args.assistantMessageId,
      config,
      runId,
      session,
      system,
      transcriptMessages,
    })
  }

  private collectMessagesBefore(messageId: string, config: RunConfigType): Rows['messages'][] {
    const target = this.helpers.typedStore.tables.messages.requireEntity(messageId)
    const messages = this.helpers.typedIndexes
      .getSliceRowIds('messagesBySession', target.sessionId)
      .map((id) => this.helpers.typedStore.tables.messages.requireEntity(id))
    const targetIndex = messages.findIndex((message) => message.id === messageId)
    if (targetIndex === -1) {
      throw new Error(`Message not found in session transcript: ${messageId}`)
    }

    const transcriptMessages = messages.slice(0, targetIndex)
    if (config.maxMessages === 0) {
      return transcriptMessages
    }

    return transcriptMessages.slice(-config.maxMessages)
  }

  private clearAssistantMessageForRegeneration(messageId: string): void {
    this.helpers.typedStore.tables.messages.requireEntity(messageId)

    // Regeneration clears the committed assistant result, step rows, and any streaming buffer.
    this.helpers.rawStore.transaction(() => {
      for (const stepId of this.helpers.typedIndexes.getSliceRowIds('stepsByMessage', messageId)) {
        this.helpers.typedStore.tables.steps.deleteRow(stepId)
      }

      this.helpers.typedStore.tables.messages.updateRow(messageId, {
        parts: [],
        updatedAt: Date.now(),
      })
      this.helpers.typedStore.tables.streamingMessageParts.deleteRow(messageId)
    })
  }

  private commitInterruptedStreamingParts(): void {
    for (const messageId of this.helpers.typedStore.tables.streamingMessageParts.getRowIds()) {
      const streamingParts =
        this.helpers.typedStore.tables.streamingMessageParts.requireEntity(messageId)

      this.helpers.typedStore.tables.messages.updateRow(messageId, {
        parts: streamingParts.parts,
        updatedAt: Date.now(),
      })
      this.helpers.typedStore.tables.streamingMessageParts.deleteRow(messageId)
    }
  }

  private failInterruptedRuns(message = 'Run interrupted'): void {
    for (const runId of this.helpers.typedStore.tables.runs.getRowIds()) {
      const status = this.helpers.typedStore.tables.runs.getCell(runId, 'status')
      if (status === 'preparing' || status === 'streaming') {
        failRunRecord(this.helpers.typedStore, runId, message)
      }
    }
  }

  private launchRun(runStart: RunStart): Run {
    const run = new Run({
      credentials: this.credentials,
      helpers: this.helpers,
      modelResolver: this.modelResolver,
      start: runStart,
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

    const prompt = this.helpers.typedStore.tables.prompts.requireEntity(config.systemPromptId)
    return prompt.content
  }
}
