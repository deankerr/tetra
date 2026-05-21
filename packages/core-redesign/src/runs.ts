import type { Accessors } from '#accessors'
import { RequestConfig } from '#db'
import type { RequestConfig as RequestConfigType, Rows } from '#db'
import { Run, openRouterLanguageModelResolver } from '#run'
import type { CredentialReader, LanguageModelResolver, RunStart } from '#run'

export interface SendMessageArgs {
  config?: Partial<RequestConfigType>
  content: string
}

export interface RegenerateArgs {
  config?: Partial<RequestConfigType>
}

export class Runs {
  private readonly accessors: Accessors
  private readonly active = new Map<string, Run>()
  private readonly credentials: CredentialReader
  private readonly modelResolver: LanguageModelResolver

  constructor(
    accessors: Accessors,
    credentials: CredentialReader,
    modelResolver: LanguageModelResolver = openRouterLanguageModelResolver,
  ) {
    this.accessors = accessors
    this.credentials = credentials
    this.modelResolver = modelResolver
  }

  cancel(requestId: string): void {
    this.active.get(requestId)?.cancel()
  }

  get(requestId: string): Run | null {
    return this.active.get(requestId) ?? null
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
    this.accessors.requests.recoverInterrupted('Request interrupted')
  }

  regenerate(assistantMessageId: string, args: RegenerateArgs = {}): Run {
    const assistantMessage = this.accessors.messages.get(assistantMessageId)
    if (assistantMessage.role !== 'assistant') {
      throw new Error(`Cannot regenerate non-assistant message: ${assistantMessageId}`)
    }

    const session = this.accessors.sessions.get(assistantMessage.sessionId)
    const config = RequestConfig.parse({ ...session.config, ...args.config })
    const system = this.requireSystemPrompt(config)
    const transcriptMessages = this.collectMessagesBefore(assistantMessageId, config)

    let requestId = ''
    this.accessors.transaction(() => {
      this.accessors.messages.update(assistantMessageId, { parts: [] })
      this.accessors.sessions.touch(session.id)
      requestId = this.accessors.requests.create({
        assistantMessageId,
        config,
        sessionId: session.id,
      })
    })

    return this.start({
      assistantMessageId,
      config,
      requestId,
      session,
      system,
      transcriptMessages,
    })
  }

  sendMessage(sessionId: string, args: SendMessageArgs): Run {
    const content = args.content.trim()
    if (content === '') {
      throw new Error('Cannot start a run with an empty user message')
    }

    const session = this.accessors.sessions.get(sessionId)
    const config = RequestConfig.parse({ ...session.config, ...args.config })
    const system = this.requireSystemPrompt(config)

    let assistantMessageId = ''
    let requestId = ''
    this.accessors.transaction(() => {
      this.accessors.messages.create(sessionId, {
        parts: [{ text: args.content, type: 'text' }],
        role: 'user',
      })
      assistantMessageId = this.accessors.messages.create(sessionId, {
        parts: [],
        role: 'assistant',
      })
      this.accessors.sessions.touch(sessionId)
      requestId = this.accessors.requests.create({
        assistantMessageId,
        config,
        sessionId,
      })
    })

    const transcriptMessages = this.collectMessagesForRun({
      excludeMessageId: assistantMessageId,
      maxMessages: config.maxMessages,
      sessionId,
    })

    return this.start({
      assistantMessageId,
      config,
      requestId,
      session,
      system,
      transcriptMessages,
    })
  }

  start(args: RunStart): Run {
    const run = new Run({
      accessors: this.accessors,
      credentials: this.credentials,
      modelResolver: this.modelResolver,
      start: args,
    })

    this.active.set(run.requestId, run)
    void this.removeWhenDone(run)
    run.start()

    return run
  }

  private collectMessagesBefore(messageId: string, config: RequestConfigType): Rows.Message[] {
    const target = this.accessors.messages.get(messageId)
    const messages = this.accessors.messages.listForSession(target.sessionId)
    const targetIndex = messages.findIndex((message) => message.id === messageId)
    if (targetIndex === -1) {
      throw new Error(`Message not found in session transcript: ${messageId}`)
    }

    const transcriptMessages = messages.slice(0, targetIndex)
    if (config.maxMessages === undefined) {
      return transcriptMessages
    }

    return transcriptMessages.slice(-config.maxMessages)
  }

  private collectMessagesForRun(args: {
    excludeMessageId: string
    maxMessages?: number
    sessionId: string
  }): Rows.Message[] {
    let messages = this.accessors.messages
      .listForSession(args.sessionId)
      .filter((message) => message.id !== args.excludeMessageId)

    if (args.maxMessages !== undefined) {
      messages = messages.slice(-args.maxMessages)
    }

    return messages
  }

  private async removeWhenDone(run: Run): Promise<void> {
    await run.done
    this.active.delete(run.requestId)
  }

  private requireSystemPrompt(config: RequestConfigType): string | undefined {
    if (config.systemPromptId === undefined) {
      return undefined
    }

    const prompt = this.accessors.prompts.get(config.systemPromptId)
    return prompt.content
  }
}
