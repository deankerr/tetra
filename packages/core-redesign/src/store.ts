import type { UIMessage } from 'ai'

import {
  DEFAULT_REQUEST_CONFIG,
  LanguageModelRecord,
  MessageRole,
  RequestConfig,
  RequestStatus,
  createIdGenerator,
} from '#db'
import type { MessageRole as MessageRoleType, Rows, StepRecord, TetraDb } from '#db'

export interface MessagePatch {
  parts?: UIMessage['parts']
  role?: MessageRoleType
}

export class Store {
  readonly db: TetraDb

  private readonly nextMessageId = createIdGenerator('mesg')
  private readonly nextPromptId = createIdGenerator('prpt')
  private readonly nextSessionId = createIdGenerator('sess')

  constructor(db: TetraDb) {
    this.db = db
  }

  // ——— Sessions ———

  createSession(args: { config?: Rows.Session['config']; title?: string } = {}): string {
    const sessionId = this.nextSessionId()
    const now = Date.now()

    this.db.store.setRow('sessions', sessionId, {
      config: args.config ?? DEFAULT_REQUEST_CONFIG,
      createdAt: now,
      title: args.title ?? '',
      updatedAt: now,
    })

    return sessionId
  }

  deleteSession(sessionId: string): void {
    this.requireSession(sessionId)

    // Cascade: remove all messages and requests before deleting the session row.
    this.db.store.transaction(() => {
      for (const messageId of this.db.indexes.getSliceRowIds('messagesBySession', sessionId)) {
        this.db.store.delRow('messages', messageId)
      }

      for (const requestId of this.db.indexes.getSliceRowIds('requestsBySession', sessionId)) {
        this.db.store.delRow('requests', requestId)
      }

      this.db.store.delRow('sessions', sessionId)
    })
  }

  getSession(sessionId: string): Rows.Session {
    this.requireSession(sessionId)
    const row = this.db.store.getRow('sessions', sessionId)

    return {
      config: this.getSessionConfig(sessionId),
      createdAt: row.createdAt,
      id: sessionId,
      title: row.title,
      updatedAt: row.updatedAt,
    }
  }

  // Uses safeParse with a fallback so stored rows that predate schema changes don't throw.
  getSessionConfig(sessionId: string): Rows.Session['config'] {
    const raw = this.db.store.getCell('sessions', sessionId, 'config')
    const result = RequestConfig.safeParse(raw)
    return result.success ? result.data : DEFAULT_REQUEST_CONFIG
  }

  listSessions(): Rows.Session[] {
    return this.db.store
      .getRowIds('sessions')
      .map((id) => this.getSession(id))
      .toSorted((a, b) => a.createdAt - b.createdAt)
  }

  renameSession(sessionId: string, title: string): void {
    this.requireSession(sessionId)
    this.db.store.setPartialRow('sessions', sessionId, { title, updatedAt: Date.now() })
  }

  setSessionConfig(sessionId: string, config: Rows.Session['config']): void {
    this.requireSession(sessionId)
    this.db.store.setPartialRow('sessions', sessionId, {
      config: RequestConfig.parse(config),
      updatedAt: Date.now(),
    })
  }

  sessionExists(sessionId: string): boolean {
    return this.db.store.hasRow('sessions', sessionId)
  }

  touchSession(sessionId: string): void {
    this.requireSession(sessionId)
    this.db.store.setCell('sessions', sessionId, 'updatedAt', Date.now())
  }

  // ——— Messages ———

  appendMessage(
    sessionId: string,
    args: { parts: UIMessage['parts']; role: MessageRoleType },
  ): string {
    this.requireSession(sessionId)
    const messageId = this.nextMessageId()
    const now = Date.now()

    this.db.store.setRow('messages', messageId, {
      createdAt: now,
      parts: args.parts,
      role: args.role,
      sessionId,
      updatedAt: now,
    })

    // Touch session to update its updatedAt whenever a message is appended.
    this.db.store.setCell('sessions', sessionId, 'updatedAt', now)

    return messageId
  }

  appendTextMessage(sessionId: string, args: { role: MessageRoleType; text: string }): string {
    return this.appendMessage(sessionId, {
      parts: [{ text: args.text, type: 'text' }],
      role: args.role,
    })
  }

  deleteMessage(messageId: string): void {
    const message = this.getMessage(messageId)
    this.db.store.delRow('messages', messageId)
    this.db.store.setCell('sessions', message.sessionId, 'updatedAt', Date.now())
  }

  getMessage(messageId: string): Rows.Message {
    this.requireMessage(messageId)
    const row = this.db.store.getRow('messages', messageId)

    return {
      createdAt: row.createdAt,
      id: messageId,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- UIMessage parts are stored verbatim in TinyBase's array cell.
      parts: row.parts as UIMessage['parts'],
      role: MessageRole.parse(row.role),
      sessionId: row.sessionId,
      updatedAt: row.updatedAt,
    }
  }

  listMessages(sessionId: string): Rows.Message[] {
    return this.db.indexes
      .getSliceRowIds('messagesBySession', sessionId)
      .map((id) => this.getMessage(id))
  }

  // Raw update — does not touch the session. Used by Run for streaming writes.
  updateMessage(messageId: string, patch: MessagePatch): void {
    this.requireMessage(messageId)

    this.db.store.setPartialRow('messages', messageId, {
      ...('parts' in patch && { parts: patch.parts ?? [] }),
      ...('role' in patch && { role: MessageRole.parse(patch.role) }),
      updatedAt: Date.now(),
    })
  }

  // ——— Requests (reads only — writes are owned by run.ts/requests.ts) ———

  getRequest(requestId: string): Rows.Request {
    if (!this.db.store.hasRow('requests', requestId)) {
      throw new Error(`Request not found: ${requestId}`)
    }

    const row = this.db.store.getRow('requests', requestId)

    return {
      assistantMessageId: row.assistantMessageId,
      config: RequestConfig.parse(row.config),
      createdAt: row.createdAt,
      errorMessage: row.errorMessage,
      id: requestId,
      sessionId: row.sessionId,
      status: RequestStatus.parse(row.status),
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- StepRecord[] is stored verbatim in TinyBase's array cell.
      steps: row.steps as StepRecord[],
      terminalAt: row.terminalAt,
    }
  }

  listRequestIds(sessionId: string): string[] {
    return this.db.indexes.getSliceRowIds('requestsBySession', sessionId)
  }

  // ——— Prompts ———

  createPrompt(args: { content?: string; label?: string } = {}): string {
    const promptId = this.nextPromptId()

    this.db.store.setRow('prompts', promptId, {
      content: args.content ?? '',
      label: args.label ?? '',
    })

    return promptId
  }

  // Removes the prompt and unlinks it from any sessions that reference it.
  deletePrompt(promptId: string): void {
    this.requirePrompt(promptId)

    this.db.store.transaction(() => {
      for (const sessionId of this.db.store.getRowIds('sessions')) {
        const config = this.getSessionConfig(sessionId)
        if (config.systemPromptId !== promptId) {
          continue
        }

        const { systemPromptId: _removed, ...nextConfig } = config
        this.db.store.setPartialRow('sessions', sessionId, {
          config: RequestConfig.parse(nextConfig),
          updatedAt: Date.now(),
        })
      }

      this.db.store.delRow('prompts', promptId)
    })
  }

  getPrompt(promptId: string): Rows.Prompt {
    this.requirePrompt(promptId)
    const row = this.db.store.getRow('prompts', promptId)

    return {
      content: row.content,
      id: promptId,
      label: row.label,
    }
  }

  listPrompts(): Rows.Prompt[] {
    return this.db.store
      .getRowIds('prompts')
      .map((id) => this.getPrompt(id))
      .toSorted((a, b) => a.id.localeCompare(b.id))
  }

  updatePrompt(promptId: string, patch: { content?: string; label?: string }): void {
    this.requirePrompt(promptId)
    this.db.store.setPartialRow('prompts', promptId, patch)
  }

  // ——— Language models (reads only — writes are owned by catalog.ts) ———

  getLanguageModel(modelId: string): Rows.LanguageModel {
    if (!this.db.store.hasRow('languageModels', modelId)) {
      throw new Error(`Language model not found: ${modelId}`)
    }

    const row = this.db.store.getRow('languageModels', modelId)
    return { ...LanguageModelRecord.parse(row), id: modelId }
  }

  listLanguageModels(): Rows.LanguageModel[] {
    return this.db.store.getRowIds('languageModels').map((id) => this.getLanguageModel(id))
  }

  // ——— Transactions ———

  transaction(fn: () => void): void {
    this.db.store.transaction(fn)
  }

  // ——— Private guards ———

  private requireMessage(messageId: string): void {
    if (!this.db.store.hasRow('messages', messageId)) {
      throw new Error(`Message not found: ${messageId}`)
    }
  }

  private requirePrompt(promptId: string): void {
    if (!this.db.store.hasRow('prompts', promptId)) {
      throw new Error(`Prompt not found: ${promptId}`)
    }
  }

  private requireSession(sessionId: string): void {
    if (!this.db.store.hasRow('sessions', sessionId)) {
      throw new Error(`Session not found: ${sessionId}`)
    }
  }
}
