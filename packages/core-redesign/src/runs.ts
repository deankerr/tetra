import type { Accessors } from '#accessors'
import { RequestConfig } from '#db'
import type { RequestConfig as RequestConfigType, Rows } from '#db'
import { Run, openRouterLanguageModelResolver } from '#run'
import type { CredentialReader, LanguageModelResolver, RunStart } from '#run'

export interface StartArgs {
  assistantMessageId: string
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

  // Callers are responsible for creating the user and assistant messages before calling start.
  // The assistant message should have empty parts; all messages before it become the transcript.
  start(args: StartArgs): Run {
    const assistantMessage = this.accessors.messages.get(args.assistantMessageId)
    const session = this.accessors.sessions.get(assistantMessage.sessionId)
    const config = RequestConfig.parse({ ...session.config, ...args.config })
    const system = this.requireSystemPrompt(config)
    const transcriptMessages = this.collectMessagesBefore(args.assistantMessageId, config)

    let requestId = ''
    this.accessors.transaction(() => {
      this.accessors.sessions.touch(session.id)
      requestId = this.accessors.requests.create({
        assistantMessageId: args.assistantMessageId,
        config,
        sessionId: session.id,
      })
    })

    return this.launchRun({
      assistantMessageId: args.assistantMessageId,
      config,
      requestId,
      session,
      system,
      transcriptMessages,
    })
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

  private launchRun(runStart: RunStart): Run {
    const run = new Run({
      accessors: this.accessors,
      credentials: this.credentials,
      modelResolver: this.modelResolver,
      start: runStart,
    })

    this.active.set(run.requestId, run)
    void this.removeWhenDone(run)
    run.start()

    return run
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
