import { DEFAULT_RUN_CONFIG, RunConfigSchema } from '@tetra/store-schema'
import type {
  Rows,
  TetraTypedIndexes,
  TetraRawStore,
  TetraTypedStore,
  RunConfig,
} from '@tetra/store-schema'
import type { UIMessage } from 'ai'

import { createIdGenerator } from '#ids'

export class Helpers {
  readonly rawStore: TetraRawStore
  readonly typedIndexes: TetraTypedIndexes
  readonly typedStore: TetraTypedStore

  private readonly nextMessageId = createIdGenerator('mesg')
  private readonly nextPromptId = createIdGenerator('prpt')
  private readonly nextSessionId = createIdGenerator('sess')

  constructor({
    rawStore,
    typedIndexes,
    typedStore,
  }: {
    rawStore: TetraRawStore
    typedIndexes: TetraTypedIndexes
    typedStore: TetraTypedStore
  }) {
    this.rawStore = rawStore
    this.typedIndexes = typedIndexes
    this.typedStore = typedStore
  }

  // ——— Sessions ———

  createSession(args: { config?: Partial<RunConfig>; title?: string } = {}): string {
    const sessionId = this.nextSessionId()
    const storedDefaultConfig = this.rawStore.hasValue('defaultRunConfig')
      ? this.rawStore.getValue('defaultRunConfig')
      : DEFAULT_RUN_CONFIG
    const config = RunConfigSchema.parse({
      ...toConfigObject(storedDefaultConfig),
      ...args.config,
    })
    const now = Date.now()

    // Publish a complete session shape as one TinyBase listener/sync event.
    this.rawStore.transaction(() => {
      this.typedStore.tables.sessions.setRow(sessionId, {
        createdAt: now,
        title: args.title ?? '',
        updatedAt: now,
      })
      this.typedStore.tables.sessionRunConfigs.setRow(sessionId, config)
    })

    return sessionId
  }

  deleteSession(sessionId: string): void {
    this.typedStore.tables.sessions.requireEntity(sessionId)

    // Cascade all session-owned rows before deleting the session row.
    this.rawStore.transaction(() => {
      for (const messageId of this.typedIndexes.getSliceRowIds('messagesBySession', sessionId)) {
        this.typedStore.tables.messages.deleteRow(messageId)
      }

      for (const runId of this.typedIndexes.getSliceRowIds('runsBySessionNewestFirst', sessionId)) {
        this.typedStore.tables.runs.deleteRow(runId)
      }

      for (const messageId of this.typedIndexes.getSliceRowIds(
        'streamingPartsBySession',
        sessionId,
      )) {
        this.typedStore.tables.streamingMessageParts.deleteRow(messageId)
      }

      for (const stepId of this.typedIndexes.getSliceRowIds('stepsBySession', sessionId)) {
        this.typedStore.tables.steps.deleteRow(stepId)
      }

      this.typedStore.tables.sessionRunConfigs.deleteRow(sessionId)
      this.typedStore.tables.sessions.deleteRow(sessionId)
    })
  }

  // ——— Messages ———

  appendMessage(
    sessionId: string,
    args: { parts: UIMessage['parts']; role: Rows['messages']['role'] },
  ): string {
    this.typedStore.tables.sessions.requireEntity(sessionId)
    const messageId = this.nextMessageId()
    const now = Date.now()

    this.typedStore.tables.messages.setRow(messageId, {
      createdAt: now,
      parts: args.parts,
      role: args.role,
      sessionId,
      updatedAt: now,
    })

    // Touch session to update its updatedAt whenever a message is appended.
    this.typedStore.tables.sessions.setCell(sessionId, 'updatedAt', now)

    return messageId
  }

  deleteMessage(messageId: string): void {
    const message = this.typedStore.tables.messages.requireEntity(messageId)
    const now = Date.now()

    // Remove run and step sidecars for assistant messages before dropping the content row.
    this.rawStore.transaction(() => {
      for (const runId of this.typedIndexes.getSliceRowIds(
        'runsByAssistantMessageNewestFirst',
        messageId,
      )) {
        for (const stepId of this.typedIndexes.getSliceRowIds('stepsByRun', runId)) {
          this.typedStore.tables.steps.deleteRow(stepId)
        }
        this.typedStore.tables.runs.deleteRow(runId)
      }

      for (const stepId of this.typedIndexes.getSliceRowIds('stepsByMessage', messageId)) {
        this.typedStore.tables.steps.deleteRow(stepId)
      }

      this.typedStore.tables.streamingMessageParts.deleteRow(messageId)
      this.typedStore.tables.messages.deleteRow(messageId)
      this.typedStore.tables.sessions.setCell(message.sessionId, 'updatedAt', now)
    })
  }

  // ——— Prompts ———

  createPrompt(args: { content?: string; label?: string } = {}): string {
    const promptId = this.nextPromptId()
    const now = Date.now()

    this.typedStore.tables.prompts.setRow(promptId, {
      content: args.content ?? '',
      createdAt: now,
      label: args.label ?? '',
      updatedAt: now,
    })

    return promptId
  }

  // Removes the prompt and unlinks it from any sessions that reference it.
  deletePrompt(promptId: string): void {
    this.typedStore.tables.prompts.requireEntity(promptId)

    this.rawStore.transaction(() => {
      for (const sessionId of this.typedStore.tables.sessions.getRowIds()) {
        if (
          this.typedStore.tables.sessionRunConfigs.getCell(sessionId, 'systemPromptId') === promptId
        ) {
          this.typedStore.tables.sessionRunConfigs.setCell(sessionId, 'systemPromptId', '')
        }
      }

      this.typedStore.tables.prompts.deleteRow(promptId)
    })
  }

  exportSession(sessionId: string) {
    if (!this.typedStore.tables.sessions.hasRow(sessionId)) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    return {
      exportedAt: new Date().toISOString(),
      messages: this.typedIndexes
        .getSliceRowIds('messagesBySession', sessionId)
        .map((id) => this.typedStore.tables.messages.requireEntity(id)),
      runs: this.typedIndexes
        .getSliceRowIds('runsBySessionNewestFirst', sessionId)
        .map((id) => this.typedStore.tables.runs.requireEntity(id)),
      session: this.typedStore.tables.sessions.requireEntity(sessionId),
      sessionRunConfig: this.typedStore.tables.sessionRunConfigs.requireEntity(sessionId),
      steps: this.typedIndexes
        .getSliceRowIds('stepsBySession', sessionId)
        .map((id) => this.typedStore.tables.steps.requireEntity(id)),
    }
  }
}

function toConfigObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value))
  }

  return {}
}
