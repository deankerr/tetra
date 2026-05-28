import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { RunConfig } from '@tetra/store-schema'
import type { RunConfig as RunConfigType, Rows, StepRecord } from '@tetra/store-schema'
import { convertToModelMessages, readUIMessageStream, stepCountIs, streamText } from 'ai'
import type { LanguageModel, ModelMessage, ToolSet, UIMessage } from 'ai'

import type { Helpers } from '#helpers'
import { resolveTools } from '#tools'

import {
  cancelRunRecord,
  completeRunRecord,
  failRunRecord,
  startRunStreaming,
} from './run-records.ts'
import { StepEvent } from './steps.ts'

const DURABLE_SNAPSHOT_INTERVAL_MS = 500

export interface CredentialReader {
  get(id: string): string
}

export interface LanguageModelResolver {
  resolve(args: { config: RunConfigType; credentials: CredentialReader }): LanguageModel
}

export interface RunStart {
  assistantMessageId: string
  config: RunConfigType
  runId: string
  session: Rows['sessions']
  system?: string
  transcriptMessages: Rows['messages'][]
}

export type RunStatus = 'cancelled' | 'completed' | 'error' | 'preparing' | 'streaming'

interface RunInit {
  credentials: CredentialReader
  modelResolver: LanguageModelResolver
  start: RunStart
  helpers: Helpers
}

export const openRouterLanguageModelResolver: LanguageModelResolver = {
  resolve: ({ config, credentials }) => {
    const openrouterApiKey = credentials.get('OPENROUTER_API_KEY').trim()
    if (openrouterApiKey === '') {
      throw new Error('OPENROUTER_API_KEY is required for model inference')
    }

    return createOpenRouter({ apiKey: openrouterApiKey })(config.modelId)
  },
}

export class Run extends EventTarget {
  readonly abortController = new AbortController()
  readonly assistantMessageId: string
  readonly config: RunConfigType
  readonly done: Promise<void>
  readonly runId: string
  readonly session: Rows['sessions']
  readonly sessionId: string
  readonly system: string | undefined
  readonly transcriptMessages: Rows['messages'][]

  error: unknown = null
  finalParts: UIMessage['parts'] | null = null
  lastDurableWriteAt = 0
  model: LanguageModel | null = null
  modelMessages: ModelMessage[] = []
  parts: UIMessage['parts'] = []
  result: ReturnType<typeof streamText> | null = null
  status: RunStatus = 'preparing'
  tools: ToolSet = {}

  private readonly credentials: CredentialReader
  private readonly helpers: Helpers
  private readonly doneController = Promise.withResolvers<undefined>()
  private readonly modelResolver: LanguageModelResolver

  constructor(init: RunInit) {
    super()
    this.assistantMessageId = init.start.assistantMessageId
    this.config = init.start.config
    this.credentials = init.credentials
    this.done = this.doneController.promise
    this.modelResolver = init.modelResolver
    this.helpers = init.helpers
    this.runId = init.start.runId
    this.session = init.start.session
    this.sessionId = init.start.session.id
    this.system = init.start.system
    this.transcriptMessages = init.start.transcriptMessages
  }

  cancel(): void {
    this.abortController.abort('user-cancel')
  }

  start(): void {
    this.createStreamingParts()
    void this.stream()
  }

  private complete(parts: UIMessage['parts']): void {
    this.parts = [...parts]
    this.finalParts = [...parts]
    this.writeStreamingPartsSnapshot(parts)
    this.commitStreamingParts()
    completeRunRecord(this.helpers.typedStore, this.runId)
    this.setStatus('completed')
    this.dispatchEvent(new Event('finish'))
    this.doneController.resolve()
  }

  private fail(error: unknown): void {
    this.error = error
    if (this.abortController.signal.aborted) {
      this.writeStreamingPartsSnapshot(this.parts)
      this.commitStreamingParts()
      cancelRunRecord(this.helpers.typedStore, this.runId, 'Run cancelled')
      this.setStatus('cancelled')
      this.dispatchEvent(new Event('cancel'))
      this.doneController.resolve()
      return
    }

    this.writeStreamingPartsSnapshot(this.parts)
    this.commitStreamingParts()
    failRunRecord(this.helpers.typedStore, this.runId, error)
    this.setStatus('error')
    this.dispatchEvent(new Event('error'))
    this.doneController.resolve()
  }

  private notifySnapshot(message: UIMessage): void {
    this.parts = [...message.parts]
    this.dispatchEvent(new Event('snapshot'))
  }

  private recordStep(step: Omit<StepRecord, 'messageId' | 'runId' | 'sessionId'>): void {
    const stepId = `${this.runId}_step_${step.stepNumber}`
    this.helpers.typedStore.tables.steps.setRow(stepId, {
      ...step,
      messageId: this.assistantMessageId,
      runId: this.runId,
      sessionId: this.sessionId,
    })
    this.dispatchEvent(new Event('step'))
  }

  private resolveModel(): LanguageModel {
    return this.modelResolver.resolve({ config: this.config, credentials: this.credentials })
  }

  private resolveTools(): ToolSet {
    return resolveTools(this.config.toolIds, (id) => this.credentials.get(id))
  }

  private setStatus(status: RunStatus): void {
    this.status = status
    this.dispatchEvent(new Event('status'))
  }

  private async stream(): Promise<void> {
    try {
      const config = RunConfig.parse(this.config)
      const tools = this.resolveTools()
      const model = this.resolveModel()
      const modelMessages = await Run.toModelMessages(this.transcriptMessages, tools)

      this.model = model
      this.modelMessages = modelMessages
      this.tools = tools
      startRunStreaming(this.helpers.typedStore, this.runId)
      this.setStatus('streaming')

      const result = streamText({
        abortSignal: this.abortController.signal,
        messages: modelMessages,
        model,
        onStepFinish: (step) => {
          this.recordStep(StepEvent.parse(step))
        },
        providerOptions: { openrouter: config.providerOptions },
        stopWhen: stepCountIs(6),
        system: this.system,
        tools,
      })

      this.result = result

      let finalParts: UIMessage['parts'] = []
      for await (const message of readUIMessageStream({
        stream: result.toUIMessageStream({ sendReasoning: true }),
        terminateOnError: true,
      })) {
        finalParts = message.parts
        this.notifySnapshot(message)
        this.writeDurableSnapshot(message)
      }

      this.complete(finalParts)
    } catch (error) {
      this.fail(error)
    }
  }

  private static async toModelMessages(
    messages: Rows['messages'][],
    tools: ToolSet,
  ): Promise<ModelMessage[]> {
    return await convertToModelMessages(
      messages.map((message) => ({
        id: message.id,
        parts: message.parts,
        role: message.role,
      })),
      { tools },
    )
  }

  private commitStreamingParts(): void {
    const streamingParts = this.helpers.typedStore.tables.streamingMessageParts.requireEntity(
      this.assistantMessageId,
    )

    this.helpers.typedStore.tables.messages.updateRow(this.assistantMessageId, {
      parts: streamingParts.parts,
      updatedAt: Date.now(),
    })
    this.helpers.typedStore.tables.streamingMessageParts.deleteRow(this.assistantMessageId)
  }

  private createStreamingParts(): void {
    const now = Date.now()

    this.helpers.typedStore.tables.streamingMessageParts.setRow(this.assistantMessageId, {
      createdAt: now,
      parts: [],
      runId: this.runId,
      sessionId: this.sessionId,
      updatedAt: now,
    })
  }

  private writeDurableSnapshot(message: UIMessage): void {
    const now = Date.now()
    if (now - this.lastDurableWriteAt < DURABLE_SNAPSHOT_INTERVAL_MS) {
      return
    }

    this.writeStreamingPartsSnapshot(message.parts)
    this.lastDurableWriteAt = now
  }

  private writeStreamingPartsSnapshot(parts: UIMessage['parts']): void {
    this.helpers.typedStore.tables.streamingMessageParts.updateRow(this.assistantMessageId, {
      parts,
      updatedAt: Date.now(),
    })
  }
}
