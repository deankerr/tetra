import type { UIMessage } from 'ai'

import { combineUsageSummaries, createIdGenerator, deriveUsageSummary } from '#db'
import type {
  GenerationStatus,
  MessageRole,
  RequestConfig,
  Rows,
  StepRecord,
  TetraDb,
  UsageSummary,
} from '#db'

export interface MessagePatch {
  parts?: UIMessage['parts']
  role?: MessageRole
}

export interface MessageGenerationPatch {
  parts?: UIMessage['parts']
  status?: GenerationStatus
  steps?: StepRecord[]
  usage?: UsageSummary
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
    this.db.tables.transaction(() => {
      this.db.tables.sessions.setRow(sessionId, {
        createdAt: now,
        title: args.title ?? '',
        updatedAt: now,
      })
      this.db.tables.sessionConfigs.setRow(sessionId, {
        maxMessages: config.maxMessages ?? 0,
        modelId: config.modelId,
        providerOptions: config.providerOptions ?? {},
        systemPromptId: config.systemPromptId ?? '',
        toolIds: config.toolIds ?? [],
      })
      this.db.tables.sessionSummaries.setRow(sessionId, {
        createdAt: now,
        updatedAt: now,
        usage: {},
      })
    })

    return sessionId
  }

  deleteSession(sessionId: string): void {
    this.requireSession(sessionId)

    // Cascade: remove messages, requests, and config before deleting the session row.
    this.db.tables.transaction(() => {
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

  getSession(sessionId: string): Rows.Session {
    return this.db.tables.sessions.requireEntity(sessionId)
  }

  // Reads from the sessionConfigs table and normalises sentinel values back to undefined.
  getSessionConfig(sessionId: string): RequestConfig {
    const row = this.db.tables.sessionConfigs.requireEntity(sessionId)
    return {
      modelId: row.modelId,
      ...(row.maxMessages !== 0 && { maxMessages: row.maxMessages }),
      ...(row.systemPromptId !== '' && { systemPromptId: row.systemPromptId }),
      ...(Object.keys(row.providerOptions).length > 0 && { providerOptions: row.providerOptions }),
      ...(row.toolIds.length > 0 && { toolIds: row.toolIds }),
    }
  }

  listSessions(): Rows.Session[] {
    return this.db.tables.sessions.listEntities().toSorted((a, b) => a.createdAt - b.createdAt)
  }

  renameSession(sessionId: string, title: string): void {
    this.db.tables.sessions.updateRow(sessionId, { title, updatedAt: Date.now() })
  }

  // Writes config fields to the sessionConfigs table, converting undefined to sentinel values.
  setSessionConfig(sessionId: string, config: RequestConfig): void {
    this.requireSession(sessionId)
    this.db.tables.sessionConfigs.setRow(sessionId, {
      maxMessages: config.maxMessages ?? 0,
      modelId: config.modelId,
      providerOptions: config.providerOptions ?? {},
      systemPromptId: config.systemPromptId ?? '',
      toolIds: config.toolIds ?? [],
    })
  }

  sessionExists(sessionId: string): boolean {
    return this.db.tables.sessions.hasRow(sessionId)
  }

  touchSession(sessionId: string): void {
    this.requireSession(sessionId)
    this.db.tables.sessions.setCell(sessionId, 'updatedAt', Date.now())
  }

  // ——— Workspace default config ———

  // Reads the mutable workspace default, falling back to the hardcoded constant.
  getDefaultConfig(): RequestConfig {
    return this.db.tables.getValue('defaultSessionConfig').getValue()
  }

  setDefaultConfig(config: RequestConfig): void {
    this.db.tables.getValue('defaultSessionConfig').setValue(config)
  }

  // ——— Messages ———

  appendMessage(sessionId: string, args: { parts: UIMessage['parts']; role: MessageRole }): string {
    this.requireSession(sessionId)
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

  appendTextMessage(sessionId: string, args: { role: MessageRole; text: string }): string {
    return this.appendMessage(sessionId, {
      parts: [{ text: args.text, type: 'text' }],
      role: args.role,
    })
  }

  deleteMessage(messageId: string): void {
    const message = this.getMessage(messageId)
    this.db.tables.messageGenerations.deleteRow(messageId)
    this.db.tables.messages.deleteRow(messageId)
    this.db.tables.sessions.setCell(message.sessionId, 'updatedAt', Date.now())
    this.rebuildSessionUsage(message.sessionId)
  }

  getMessage(messageId: string): Rows.Message {
    return this.db.tables.messages.requireEntity(messageId)
  }

  listMessages(sessionId: string): Rows.Message[] {
    return this.db.indexes
      .getSliceRowIds('messagesBySession', sessionId)
      .map((id) => this.getMessage(id))
  }

  // Raw update — does not touch the session. Used by Run for streaming writes.
  updateMessage(messageId: string, patch: MessagePatch): void {
    this.db.tables.messages.updateRow(messageId, {
      ...('parts' in patch && { parts: patch.parts ?? [] }),
      ...('role' in patch && { role: patch.role }),
      updatedAt: Date.now(),
    })
  }

  appendMessageStep(messageId: string, step: StepRecord): void {
    const message = this.getMessage(messageId)
    const steps = [...message.steps, step]
    this.setMessageGenerationResult(messageId, { parts: message.parts, steps })
    this.rebuildSessionUsage(message.sessionId)
  }

  clearMessageContent(messageId: string): void {
    this.setMessageGenerationResult(messageId, { parts: [], steps: [] })
    this.db.tables.messageGenerations.deleteRow(messageId)
    this.rebuildSessionUsage(this.getMessage(messageId).sessionId)
  }

  // ——— Message generations ———

  appendMessageGenerationStep(messageId: string, step: StepRecord): void {
    const generation = this.getMessageGeneration(messageId)
    const steps = [...generation.steps, step]
    this.updateMessageGeneration(messageId, { steps, usage: deriveUsageSummary(steps) })
    this.rebuildSessionUsage(generation.sessionId)
  }

  commitMessageGeneration(messageId: string): void {
    const generation = this.getMessageGeneration(messageId)
    this.setMessageGenerationResult(messageId, { parts: generation.parts, steps: generation.steps })
    this.db.tables.messageGenerations.deleteRow(messageId)
    this.rebuildSessionUsage(generation.sessionId)
  }

  createMessageGeneration(args: {
    messageId: string
    requestId: string
    sessionId: string
    status?: GenerationStatus
  }): void {
    const now = Date.now()
    this.db.tables.messageGenerations.setRow(args.messageId, {
      createdAt: now,
      parts: [],
      requestId: args.requestId,
      sessionId: args.sessionId,
      status: args.status ?? 'preparing',
      steps: [],
      updatedAt: now,
      usage: {},
    })
    this.rebuildSessionUsage(args.sessionId)
  }

  getMessageGeneration(messageId: string): Rows.MessageGeneration {
    return this.db.tables.messageGenerations.requireEntity(messageId)
  }

  updateMessageGeneration(messageId: string, patch: MessageGenerationPatch): void {
    this.db.tables.messageGenerations.updateRow(messageId, {
      ...('parts' in patch && { parts: patch.parts ?? [] }),
      ...('status' in patch && { status: patch.status }),
      ...('steps' in patch && { steps: patch.steps ?? [] }),
      updatedAt: Date.now(),
      ...('usage' in patch && { usage: patch.usage ?? {} }),
    })
  }

  writeMessageGenerationSnapshot(messageId: string, parts: UIMessage['parts']): void {
    this.updateMessageGeneration(messageId, { parts })
  }

  private setMessageGenerationResult(
    messageId: string,
    args: { parts: UIMessage['parts']; steps: StepRecord[] },
  ): void {
    this.db.tables.messages.updateRow(messageId, {
      parts: args.parts,
      steps: args.steps,
      updatedAt: Date.now(),
      usage: deriveUsageSummary(args.steps),
    })
  }

  // ——— Requests (reads only — writes are owned by run.ts/requests.ts) ———

  getRequest(requestId: string): Rows.Request {
    return this.db.tables.requests.requireEntity(requestId)
  }

  listRequestIds(sessionId: string): string[] {
    return this.db.indexes.getSliceRowIds('requestsBySession', sessionId)
  }

  // ——— Prompts ———

  createPrompt(args: { content?: string; label?: string } = {}): string {
    const promptId = this.nextPromptId()

    this.db.tables.prompts.setRow(promptId, {
      content: args.content ?? '',
      label: args.label ?? '',
    })

    return promptId
  }

  // Removes the prompt and unlinks it from any sessions that reference it.
  deletePrompt(promptId: string): void {
    this.requirePrompt(promptId)

    this.db.tables.transaction(() => {
      for (const sessionId of this.db.tables.sessions.getRowIds()) {
        if (this.db.tables.sessionConfigs.getCell(sessionId, 'systemPromptId') === promptId) {
          this.db.tables.sessionConfigs.setCell(sessionId, 'systemPromptId', '')
        }
      }

      this.db.tables.prompts.deleteRow(promptId)
    })
  }

  getPrompt(promptId: string): Rows.Prompt {
    this.requirePrompt(promptId)
    return this.db.tables.prompts.requireEntity(promptId)
  }

  listPrompts(): Rows.Prompt[] {
    return this.db.tables.prompts.listEntities().toSorted((a, b) => a.id.localeCompare(b.id))
  }

  updatePrompt(promptId: string, patch: { content?: string; label?: string }): void {
    this.db.tables.prompts.updateRow(promptId, patch)
  }

  // ——— Language models (reads only — writes are owned by catalog.ts) ———

  getLanguageModel(modelId: string): Rows.LanguageModel {
    return this.db.tables.languageModels.requireEntity(modelId)
  }

  listLanguageModels(): Rows.LanguageModel[] {
    return this.db.tables.languageModels.listEntities()
  }

  // ——— Transactions ———

  transaction(fn: () => void): void {
    this.db.tables.transaction(fn)
  }

  rebuildSessionUsage(sessionId: string): void {
    this.requireSession(sessionId)

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

  // ——— Private guards ———

  private requirePrompt(promptId: string): void {
    if (!this.db.tables.prompts.hasRow(promptId)) {
      throw new Error(`Prompt not found: ${promptId}`)
    }
  }

  private requireSession(sessionId: string): void {
    if (!this.db.tables.sessions.hasRow(sessionId)) {
      throw new Error(`Session not found: ${sessionId}`)
    }
  }
}
