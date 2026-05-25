import type {
  TinybaseSchemasFor,
  TinybaseTypedIndexes,
  TinybaseTypedStore,
} from '@tetra/tinybase-schema'
import type { UIMessage } from 'ai'
import type { Store } from 'tinybase/store/with-schemas'

import {
  DEFAULT_REQUEST_CONFIG,
  RequestConfig as RequestConfigSchema,
  createIdGenerator,
} from '#db'
import type { MessageRole, RequestConfig, tetraDbDefinition } from '#db'
import { combineUsageSummaries } from '#usage'

export class Helpers {
  readonly rawStore: Store<TinybaseSchemasFor<typeof tetraDbDefinition>>
  readonly typedIndexes: TinybaseTypedIndexes<typeof tetraDbDefinition>
  readonly typedStore: TinybaseTypedStore<typeof tetraDbDefinition>

  private readonly nextMessageId = createIdGenerator('mesg')
  private readonly nextPromptId = createIdGenerator('prpt')
  private readonly nextSessionId = createIdGenerator('sess')

  constructor({
    rawStore,
    typedIndexes,
    typedStore,
  }: {
    rawStore: Store<TinybaseSchemasFor<typeof tetraDbDefinition>>
    typedIndexes: TinybaseTypedIndexes<typeof tetraDbDefinition>
    typedStore: TinybaseTypedStore<typeof tetraDbDefinition>
  }) {
    this.rawStore = rawStore
    this.typedIndexes = typedIndexes
    this.typedStore = typedStore
  }

  // ——— Sessions ———

  createSession(args: { config?: Partial<RequestConfig>; title?: string } = {}): string {
    const sessionId = this.nextSessionId()
    const storedDefaultConfig = this.rawStore.hasValue('defaultSessionConfig')
      ? this.typedStore.values.defaultSessionConfig.get()
      : DEFAULT_REQUEST_CONFIG
    const config = RequestConfigSchema.parse({
      ...storedDefaultConfig,
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
      this.typedStore.tables.sessionConfigs.setRow(sessionId, config)
      this.typedStore.tables.sessionSummaries.setRow(sessionId, {
        createdAt: now,
        updatedAt: now,
        usage: {},
      })
    })

    return sessionId
  }

  deleteSession(sessionId: string): void {
    this.typedStore.tables.sessions.requireEntity(sessionId)

    // Cascade: remove messages, requests, and config before deleting the session row.
    this.rawStore.transaction(() => {
      for (const messageId of this.typedIndexes.getSliceRowIds('messagesBySession', sessionId)) {
        this.typedStore.tables.messages.deleteRow(messageId)
      }

      for (const requestId of this.typedIndexes.getSliceRowIds(
        'requestsBySessionNewestFirst',
        sessionId,
      )) {
        this.typedStore.tables.requests.deleteRow(requestId)
      }

      for (const messageId of this.typedIndexes.getSliceRowIds('generationBySession', sessionId)) {
        this.typedStore.tables.messageGenerations.deleteRow(messageId)
      }

      this.typedStore.tables.sessionSummaries.deleteRow(sessionId)
      this.typedStore.tables.sessionConfigs.deleteRow(sessionId)
      this.typedStore.tables.sessions.deleteRow(sessionId)
    })
  }

  // ——— Messages ———

  appendMessage(sessionId: string, args: { parts: UIMessage['parts']; role: MessageRole }): string {
    this.typedStore.tables.sessions.requireEntity(sessionId)
    const messageId = this.nextMessageId()
    const now = Date.now()

    this.typedStore.tables.messages.setRow(messageId, {
      createdAt: now,
      parts: args.parts,
      role: args.role,
      sessionId,
      steps: [],
      updatedAt: now,
      usage: {},
    })

    // Touch session to update its updatedAt whenever a message is appended.
    this.typedStore.tables.sessions.setCell(sessionId, 'updatedAt', now)

    return messageId
  }

  deleteMessage(messageId: string): void {
    const message = this.typedStore.tables.messages.requireEntity(messageId)
    this.typedStore.tables.messageGenerations.deleteRow(messageId)
    this.typedStore.tables.messages.deleteRow(messageId)
    this.typedStore.tables.sessions.setCell(message.sessionId, 'updatedAt', Date.now())
    this.rebuildSessionUsage(message.sessionId)
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
          this.typedStore.tables.sessionConfigs.getCell(sessionId, 'systemPromptId') === promptId
        ) {
          this.typedStore.tables.sessionConfigs.setCell(sessionId, 'systemPromptId', '')
        }
      }

      this.typedStore.tables.prompts.deleteRow(promptId)
    })
  }

  rebuildSessionUsage(sessionId: string): void {
    this.typedStore.tables.sessions.requireEntity(sessionId)

    const messageUsages = this.typedIndexes
      .getSliceRowIds('messagesBySession', sessionId)
      .map((messageId) => this.typedStore.tables.messages.getCell(messageId, 'usage') ?? {})
    const generationUsages = this.typedIndexes
      .getSliceRowIds('generationBySession', sessionId)
      .map(
        (messageId) => this.typedStore.tables.messageGenerations.getCell(messageId, 'usage') ?? {},
      )

    this.typedStore.tables.sessionSummaries.updateRow(sessionId, {
      updatedAt: Date.now(),
      usage: combineUsageSummaries([...messageUsages, ...generationUsages]),
    })
  }
}
