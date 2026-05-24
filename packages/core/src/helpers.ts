import type { UIMessage } from 'ai'

import { RequestConfig as RequestConfigSchema, createIdGenerator } from '#db'
import type { MessageRole, RequestConfig, TetraDb } from '#db'
import { combineUsageSummaries } from '#usage'

export class Helpers {
  readonly db: TetraDb

  private readonly nextMessageId = createIdGenerator('mesg')
  private readonly nextPromptId = createIdGenerator('prpt')
  private readonly nextSessionId = createIdGenerator('sess')

  constructor(db: TetraDb) {
    this.db = db
  }

  // ——— Sessions ———

  createSession(args: { config?: Partial<RequestConfig>; title?: string } = {}): string {
    const sessionId = this.nextSessionId()
    const config = RequestConfigSchema.parse({
      ...this.db.values.defaultSessionConfig.get(),
      ...args.config,
    })
    const now = Date.now()

    // Write session identity and config rows atomically.
    this.db.transaction(() => {
      this.db.tables.sessions.setRow(sessionId, {
        createdAt: now,
        title: args.title ?? '',
        updatedAt: now,
      })
      this.db.tables.sessionConfigs.setRow(sessionId, config)
      this.db.tables.sessionSummaries.setRow(sessionId, {
        createdAt: now,
        updatedAt: now,
        usage: {},
      })
    })

    return sessionId
  }

  deleteSession(sessionId: string): void {
    this.db.tables.sessions.requireEntity(sessionId)

    // Cascade: remove messages, requests, and config before deleting the session row.
    this.db.transaction(() => {
      for (const messageId of this.db.indexes.getSliceRowIds('messagesBySession', sessionId)) {
        this.db.tables.messages.deleteRow(messageId)
      }

      for (const requestId of this.db.indexes.getSliceRowIds('requestsBySession', sessionId)) {
        this.db.tables.requests.deleteRow(requestId)
      }

      for (const messageId of this.db.indexes.getSliceRowIds('generationBySession', sessionId)) {
        this.db.tables.messageGenerations.deleteRow(messageId)
      }

      this.db.tables.sessionSummaries.deleteRow(sessionId)
      this.db.tables.sessionConfigs.deleteRow(sessionId)
      this.db.tables.sessions.deleteRow(sessionId)
    })
  }

  // ——— Messages ———

  appendMessage(sessionId: string, args: { parts: UIMessage['parts']; role: MessageRole }): string {
    this.db.tables.sessions.requireEntity(sessionId)
    const messageId = this.nextMessageId()
    const now = Date.now()

    this.db.tables.messages.setRow(messageId, {
      createdAt: now,
      parts: args.parts,
      role: args.role,
      sessionId,
      steps: [],
      updatedAt: now,
      usage: {},
    })

    // Touch session to update its updatedAt whenever a message is appended.
    this.db.tables.sessions.setCell(sessionId, 'updatedAt', now)

    return messageId
  }

  deleteMessage(messageId: string): void {
    const message = this.db.tables.messages.requireEntity(messageId)
    this.db.tables.messageGenerations.deleteRow(messageId)
    this.db.tables.messages.deleteRow(messageId)
    this.db.tables.sessions.setCell(message.sessionId, 'updatedAt', Date.now())
    this.rebuildSessionUsage(message.sessionId)
  }

  // ——— Prompts ———

  createPrompt(args: { content?: string; label?: string } = {}): string {
    const promptId = this.nextPromptId()
    const now = Date.now()

    this.db.tables.prompts.setRow(promptId, {
      content: args.content ?? '',
      createdAt: now,
      label: args.label ?? '',
      updatedAt: now,
    })

    return promptId
  }

  // Removes the prompt and unlinks it from any sessions that reference it.
  deletePrompt(promptId: string): void {
    this.db.tables.prompts.requireEntity(promptId)

    this.db.transaction(() => {
      for (const sessionId of this.db.tables.sessions.getRowIds()) {
        if (this.db.tables.sessionConfigs.getCell(sessionId, 'systemPromptId') === promptId) {
          this.db.tables.sessionConfigs.setCell(sessionId, 'systemPromptId', '')
        }
      }

      this.db.tables.prompts.deleteRow(promptId)
    })
  }

  rebuildSessionUsage(sessionId: string): void {
    this.db.tables.sessions.requireEntity(sessionId)

    const messageUsages = this.db.indexes
      .getSliceRowIds('messagesBySession', sessionId)
      .map((messageId) => this.db.tables.messages.getCell(messageId, 'usage') ?? {})
    const generationUsages = this.db.indexes
      .getSliceRowIds('generationBySession', sessionId)
      .map((messageId) => this.db.tables.messageGenerations.getCell(messageId, 'usage') ?? {})

    this.db.tables.sessionSummaries.updateRow(sessionId, {
      updatedAt: Date.now(),
      usage: combineUsageSummaries([...messageUsages, ...generationUsages]),
    })
  }
}
