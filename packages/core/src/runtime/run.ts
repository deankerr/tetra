import type { CredentialsStore } from '@tetra/credentials'
import { RunConfigSchema } from '@tetra/schemas/library'
import type {
  LibraryDb,
  LibraryEntities,
  LibraryRunStatus,
  RunConfig,
} from '@tetra/schemas/library'
import { convertToModelMessages, readUIMessageStream, stepCountIs, streamText } from 'ai'
import type { LanguageModel, ModelMessage, OnStepFinishEvent, ToolSet, UIMessage } from 'ai'

import { resolveTools } from '#tools'

import type { LanguageModelResolver } from './language-model-resolver.ts'
import { StepEvent } from './steps.ts'

const DURABLE_SNAPSHOT_INTERVAL_MS = 500

type StepRecord = LibraryEntities['steps']

export interface RunStart {
  config: RunConfig
  runId: string
  session: LibraryEntities['sessions']
  system?: string
  targetMessageId: string
  transcriptMessages: LibraryEntities['messages'][]
}

interface RunInit {
  credentials: CredentialsStore
  start: RunStart
  modelResolver: LanguageModelResolver
  library: LibraryDb
}

export class Run extends EventTarget {
  readonly abortController = new AbortController()
  readonly config: RunConfig
  readonly done: Promise<void>
  readonly runId: string
  readonly session: LibraryEntities['sessions']
  readonly sessionId: string
  readonly system: string | undefined
  readonly targetMessageId: string
  readonly transcriptMessages: LibraryEntities['messages'][]

  error: unknown = null
  finalParts: UIMessage['parts'] | null = null
  lastDurableWriteAt = 0
  model: LanguageModel | null = null
  modelMessages: ModelMessage[] = []
  parts: UIMessage['parts'] = []
  result: ReturnType<typeof streamText> | null = null
  status: LibraryRunStatus = 'active'
  tools: ToolSet = {}

  private readonly credentials: CredentialsStore
  private readonly doneController = Promise.withResolvers<undefined>()
  private readonly modelResolver: LanguageModelResolver
  private readonly library: LibraryDb

  constructor(init: RunInit) {
    super()
    this.config = init.start.config
    this.credentials = init.credentials
    this.done = this.doneController.promise
    this.modelResolver = init.modelResolver
    this.runId = init.start.runId
    this.session = init.start.session
    this.sessionId = init.start.session.id
    this.system = init.start.system
    this.targetMessageId = init.start.targetMessageId
    this.transcriptMessages = init.start.transcriptMessages
    this.library = init.library
  }

  cancel(): void {
    this.abortController.abort('user-cancel')
  }

  start(): void {
    void this.stream()
  }

  private complete(parts: UIMessage['parts']): void {
    this.parts = [...parts]
    this.finalParts = [...parts]
    this.writeMessagePartsSnapshot(parts)
    this.setStatus('completed')
    this.dispatchEvent(new Event('finish'))
    this.doneController.resolve()
  }

  private fail(error: unknown): void {
    this.error = error
    if (this.abortController.signal.aborted) {
      this.writeMessagePartsSnapshot(this.parts)
      this.setStatus('cancelled')
      this.dispatchEvent(new Event('cancel'))
      this.doneController.resolve()
      return
    }

    this.writeMessagePartsSnapshot(this.parts)
    this.setStatus('error')
    this.dispatchEvent(new Event('error'))
    this.doneController.resolve()
  }

  private notifySnapshot(message: UIMessage): void {
    this.parts = [...message.parts]
    this.dispatchEvent(new Event('snapshot'))
  }

  private recordStep(step: Omit<StepRecord, 'id' | 'messageId' | 'runId' | 'sessionId'>): void {
    const stepId = `${this.runId}_step_${step.stepNumber}`
    this.library.steps.set(stepId, {
      ...step,
      messageId: this.targetMessageId,
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

  private setStatus(status: LibraryRunStatus): void {
    this.status = status
    this.dispatchEvent(new Event('status'))
  }

  private async stream(): Promise<void> {
    try {
      const config = RunConfigSchema.parse(this.config)
      const tools = this.resolveTools()
      const model = this.resolveModel()
      const modelMessages = await Run.toModelMessages(this.transcriptMessages, tools)

      this.model = model
      this.modelMessages = modelMessages
      this.tools = tools

      const streamOptions = {
        abortSignal: this.abortController.signal,
        messages: modelMessages,
        model,
        onStepFinish: (step: OnStepFinishEvent) => {
          this.recordStep(StepEvent.parse(step))
        },
        providerOptions: { openrouter: config.providerOptions },
        stopWhen: stepCountIs(6),
        tools,
      }
      const result =
        this.system === undefined
          ? streamText(streamOptions)
          : streamText({ ...streamOptions, system: this.system })

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
    messages: LibraryEntities['messages'][],
    tools: ToolSet,
  ): Promise<ModelMessage[]> {
    return await convertToModelMessages(
      messages.map((message) => ({
        id: message.id,
        parts: message.parts,
        role: toAiSdkUiMessageRole(message.role),
      })),
      { tools },
    )
  }

  private writeDurableSnapshot(message: UIMessage): void {
    const now = Date.now()
    if (now - this.lastDurableWriteAt < DURABLE_SNAPSHOT_INTERVAL_MS) {
      return
    }

    this.writeMessagePartsSnapshot(message.parts, now)
    this.lastDurableWriteAt = now
  }

  private writeMessagePartsSnapshot(parts: UIMessage['parts'], now = Date.now()): void {
    this.library.messages.update(this.targetMessageId, {
      parts,
      updatedAt: now,
    })
  }
}

function toAiSdkUiMessageRole(role: string): UIMessage['role'] {
  if (role === 'assistant' || role === 'system' || role === 'user') {
    return role
  }

  throw new Error(`Cannot project message role to AI SDK UIMessage role: ${role}`)
}
