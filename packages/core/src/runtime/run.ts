import type { CredentialsStore } from '@tetra/credentials'
import { RunConfigSchema } from '@tetra/stores/library'
import type {
  LibraryRows as Rows,
  LibraryRunStatus,
  LibraryTypedStore,
  RunConfig as RunConfigType,
} from '@tetra/stores/library'
import { convertToModelMessages, readUIMessageStream, stepCountIs, streamText } from 'ai'
import type { LanguageModel, ModelMessage, ToolSet, UIMessage } from 'ai'

import { resolveTools } from '#tools'

import type { LanguageModelResolver } from './language-model-resolver.ts'
import { cancelRunRecord, completeRunRecord, failRunRecord } from './run-records.ts'
import { StepEvent } from './steps.ts'

const DURABLE_SNAPSHOT_INTERVAL_MS = 500

type StepRecord = Rows['steps']

export interface RunStart {
  config: RunConfigType
  runId: string
  session: Rows['sessions']
  system?: string
  targetMessageId: string
  transcriptMessages: Rows['messages'][]
}

interface RunInit {
  credentials: CredentialsStore
  start: RunStart
  modelResolver: LanguageModelResolver
  typedStore: LibraryTypedStore
}

export class Run extends EventTarget {
  readonly abortController = new AbortController()
  readonly config: RunConfigType
  readonly done: Promise<void>
  readonly runId: string
  readonly session: Rows['sessions']
  readonly sessionId: string
  readonly system: string | undefined
  readonly targetMessageId: string
  readonly transcriptMessages: Rows['messages'][]

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
  private readonly typedStore: LibraryTypedStore

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
    this.typedStore = init.typedStore
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
    completeRunRecord(this.typedStore, this.runId)
    this.setStatus('completed')
    this.dispatchEvent(new Event('finish'))
    this.doneController.resolve()
  }

  private fail(error: unknown): void {
    this.error = error
    if (this.abortController.signal.aborted) {
      this.writeMessagePartsSnapshot(this.parts)
      cancelRunRecord(this.typedStore, this.runId, 'Run cancelled')
      this.setStatus('cancelled')
      this.dispatchEvent(new Event('cancel'))
      this.doneController.resolve()
      return
    }

    this.writeMessagePartsSnapshot(this.parts)
    failRunRecord(this.typedStore, this.runId, error)
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
    this.typedStore.tables.steps.setRow(stepId, {
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
    this.typedStore.tables.messages.updateRow(this.targetMessageId, {
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
