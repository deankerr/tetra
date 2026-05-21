import { RequestConfig } from '#db'
import type { RequestConfig as RequestConfigType, Rows } from '#db'
import { createRequest, recoverInterrupted } from '#requests'
import { Run, openRouterLanguageModelResolver } from '#run'
import type { CredentialReader, LanguageModelResolver, RunStart } from '#run'
import type { Store } from '#store'

export interface StartArgs {
  assistantMessageId: string
  config?: Partial<RequestConfigType>
}

export class Runs {
  private readonly active = new Map<string, Run>()
  private readonly credentials: CredentialReader
  private readonly modelResolver: LanguageModelResolver
  private readonly store: Store

  constructor(
    store: Store,
    credentials: CredentialReader,
    modelResolver: LanguageModelResolver = openRouterLanguageModelResolver,
  ) {
    this.credentials = credentials
    this.modelResolver = modelResolver
    this.store = store
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
    recoverInterrupted(this.store.db)
  }

  // Callers are responsible for creating the user and assistant messages before calling start.
  // The assistant message should have empty parts; all messages before it become the transcript.
  start(args: StartArgs): Run {
    const assistantMessage = this.store.getMessage(args.assistantMessageId)
    const session = this.store.getSession(assistantMessage.sessionId)
    const config = RequestConfig.parse({ ...session.config, ...args.config })
    const system = this.requireSystemPrompt(config)
    const transcriptMessages = this.collectMessagesBefore(args.assistantMessageId, config)

    let requestId = ''
    this.store.transaction(() => {
      this.store.touchSession(session.id)
      requestId = createRequest(this.store.db, {
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
    const target = this.store.getMessage(messageId)
    const messages = this.store.listMessages(target.sessionId)
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
      credentials: this.credentials,
      modelResolver: this.modelResolver,
      start: runStart,
      store: this.store,
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

    const prompt = this.store.getPrompt(config.systemPromptId)
    return prompt.content
  }
}
