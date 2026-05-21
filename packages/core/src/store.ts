import type { UIMessage } from 'ai'

import { DEFAULT_REQUEST_CONFIG, RequestConfig, createIdGenerator } from '#db'
import type { MessageRole, Rows, StepRecord, TetraDb, RequestStatus } from '#db'

export interface MessagePatch {
  parts?: UIMessage['parts']
  role?: MessageRole
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

  createSession(args: { config?: RequestConfig; title?: string } = {}): string {
    const sessionId = this.nextSessionId()
    const config = args.config ?? this.getDefaultConfig()
    const now = Date.now()

    // Write session identity and config rows atomically.
    this.db.store.transaction(() => {
      this.db.store.setRow('sessions', sessionId, {
        createdAt: now,
        title: args.title ?? '',
        updatedAt: now,
      })
      this.db.store.setRow('sessionConfigs', sessionId, {
        maxMessages: config.maxMessages ?? 0,
        modelId: config.modelId,
        providerOptions: config.providerOptions ?? {},
        systemPromptId: config.systemPromptId ?? '',
        toolIds: config.toolIds ?? [],
      })
    })

    return sessionId
  }

  deleteSession(sessionId: string): void {
    this.requireSession(sessionId)

    // Cascade: remove messages, requests, and config before deleting the session row.
    this.db.store.transaction(() => {
      for (const messageId of this.db.indexes.getSliceRowIds('messagesBySession', sessionId)) {
        this.db.store.delRow('messages', messageId)
      }

      for (const requestId of this.db.indexes.getSliceRowIds('requestsBySession', sessionId)) {
        this.db.store.delRow('requests', requestId)
      }

      this.db.store.delRow('sessionConfigs', sessionId)
      this.db.store.delRow('sessions', sessionId)
    })
  }

  getSession(sessionId: string): Rows.Session {
    this.requireSession(sessionId)
    const row = this.db.store.getRow('sessions', sessionId)
    return { ...row, id: sessionId }
  }

  // Reads from the sessionConfigs table and normalises sentinel values back to undefined.
  getSessionConfig(sessionId: string): RequestConfig {
    const row = this.db.store.getRow('sessionConfigs', sessionId)
    // JsonObject (TinyBase) and JSONObject (@ai-sdk/provider) are structurally identical.
    // oxlint-disable-next-line no-unsafe-type-assertion
    const providerOptions = row.providerOptions as unknown as RequestConfig['providerOptions']
    // oxlint-disable-next-line no-unsafe-type-assertion -- toolIds written as string[], TinyBase reads back as Json[].
    const toolIds = row.toolIds as string[]
    return {
      modelId: row.modelId,
      ...(row.maxMessages !== 0 && { maxMessages: row.maxMessages }),
      ...(row.systemPromptId !== '' && { systemPromptId: row.systemPromptId }),
      ...(Object.keys(row.providerOptions).length > 0 && { providerOptions }),
      ...(row.toolIds.length > 0 && { toolIds }),
    }
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

  // Writes config fields to the sessionConfigs table, converting undefined to sentinel values.
  setSessionConfig(sessionId: string, config: RequestConfig): void {
    this.requireSession(sessionId)
    this.db.store.setRow('sessionConfigs', sessionId, {
      maxMessages: config.maxMessages ?? 0,
      modelId: config.modelId,
      providerOptions: config.providerOptions ?? {},
      systemPromptId: config.systemPromptId ?? '',
      toolIds: config.toolIds ?? [],
    })
  }

  sessionExists(sessionId: string): boolean {
    return this.db.store.hasRow('sessions', sessionId)
  }

  touchSession(sessionId: string): void {
    this.requireSession(sessionId)
    this.db.store.setCell('sessions', sessionId, 'updatedAt', Date.now())
  }

  // ——— Workspace default config ———

  // Reads the mutable workspace default, falling back to the hardcoded constant.
  getDefaultConfig(): RequestConfig {
    const raw = this.db.store.getValue('defaultSessionConfig')
    const result = RequestConfig.safeParse(raw)
    return result.success ? result.data : DEFAULT_REQUEST_CONFIG
  }

  setDefaultConfig(config: RequestConfig): void {
    this.db.store.setValue('defaultSessionConfig', RequestConfig.parse(config))
  }

  // ——— Messages ———

  appendMessage(sessionId: string, args: { parts: UIMessage['parts']; role: MessageRole }): string {
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

  appendTextMessage(sessionId: string, args: { role: MessageRole; text: string }): string {
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
      // oxlint-disable-next-line no-unsafe-type-assertion -- role is written as MessageRole and read back as string by TinyBase.
      role: row.role as MessageRole,
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
      ...('role' in patch && { role: patch.role }),
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
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- RequestStatus is stored verbatim.
      status: row.status as RequestStatus,
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
        if (this.db.store.getCell('sessionConfigs', sessionId, 'systemPromptId') === promptId) {
          this.db.store.setCell('sessionConfigs', sessionId, 'systemPromptId', '')
        }
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
    // oxlint-disable-next-line no-unsafe-type-assertion -- TinyBase types arrays as Json[]; we write string[] and read them back as such.
    return { ...row, id: modelId } as Rows.LanguageModel
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
