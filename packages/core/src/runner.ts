import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { CredentialStore } from '@tetra/credentials'
import type { UIMessage } from 'ai'
import { readUIMessageStream, stepCountIs, streamText } from 'ai'

import type { StepRecord } from '#model'
import { ModelConfig, generateId } from '#model'
import type { Sessions } from '#sessions'
import { parseStep } from '#step'
import type { TetraStore } from '#store'
import { resolveTools } from '#tools'

export interface ExecuteArgs {
  config?: Partial<ModelConfig>
  content: string
  // Called on each UIMessage snapshot during streaming — for live rendering.
  // React passes streamingState.update; CLI passes a stdout printer.
  onSnapshot?: (msg: UIMessage) => void
}

export interface ExecuteResult {
  assistantMessageId: string
  requestId: string
}

export interface Runner {
  cancel(requestId: string): void
  execute(sessionId: string, args: ExecuteArgs): ExecuteResult
  // On startup: recover any requests interrupted by a process restart.
  recover(): void
}

export function createRunner(
  tetraStore: TetraStore,
  sessions: Sessions,
  credentials: CredentialStore,
): Runner {
  const { indexes, store } = tetraStore

  // Active abort controllers — keyed by requestId, removed on completion/error/cancel
  const controllers = new Map<string, AbortController>()

  async function runStream(
    requestId: string,
    sessionId: string,
    assistantMessageId: string,
    config: ModelConfig,
    abort: AbortController,
    onSnapshot?: (msg: UIMessage) => void,
  ): Promise<void> {
    try {
      // Validate required inference credentials before creating the provider.
      const openrouterApiKey = credentials.get('OPENROUTER_API_KEY').trim()
      if (openrouterApiKey === '') {
        throw new Error('OPENROUTER_API_KEY is required for model inference')
      }

      // OpenRouter is the app's sole inference provider.
      const openrouter = createOpenRouter({ apiKey: openrouterApiKey })

      // History is read here, after execute() has synchronously written the new user
      // message and assistant placeholder — so they're already in the store.
      const messages = await sessions.gatherModelMessages(
        sessionId,
        assistantMessageId,
        config.maxMessages,
      )

      const { providerOptions = {}, toolIds: requestedToolIds = [] } = config

      // Instantiate each tool with its resolved credentials.
      const tools = resolveTools(requestedToolIds, (id) => credentials.get(id))

      const systemPrompt =
        config.systemPromptId === undefined
          ? undefined
          : store.getCell('prompts', config.systemPromptId, 'content') || undefined

      const result = streamText({
        abortSignal: abort.signal,
        experimental_onStart: (event) => {
          console.log('streamText onStart', { event, requestId })
        },
        messages,
        model: openrouter(config.modelId),
        onAbort: () => {
          console.warn('streamText aborted', { requestId })
        },
        onStepFinish: (step) => {
          // Append to the request's embedded steps array — read-modify-write is safe here
          // because only one runner process writes to a given request row.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- steps stored as StepRecord[]
          const prior = (store.getCell('requests', requestId, 'steps') as StepRecord[]) ?? []
          store.setCell('requests', requestId, 'steps', [...prior, parseStep(step)])
        },
        providerOptions: { openrouter: providerOptions },
        stopWhen: stepCountIs(6),
        system: systemPrompt,
        tools,
      })

      // readUIMessageStream converts the chunk stream into a sequence of assembled
      // UIMessage snapshots — one per meaningful update (text chunk, tool result, etc.).
      // Each snapshot goes to the caller for live rendering. We also throttle-write
      // the latest snapshot to the store every 500 ms so a crash mid-stream leaves a
      // recoverable partial message rather than an empty placeholder.
      let finalParts: UIMessage['parts'] = []
      let lastWrite = 0
      for await (const msg of readUIMessageStream({
        stream: result.toUIMessageStream({ sendReasoning: true }),
      })) {
        onSnapshot?.(msg)
        finalParts = msg.parts
        const now = Date.now()
        if (now - lastWrite >= 500) {
          store.setPartialRow('messages', assistantMessageId, { parts: finalParts, updatedAt: now })
          lastWrite = now
        }
      }

      // Write the fully assembled UIMessage parts once — this is the durable record.
      // Readers that missed the live stream (page reload, second client) read from here.
      store.setPartialRow('messages', assistantMessageId, {
        parts: finalParts,
        updatedAt: Date.now(),
      })

      store.setPartialRow('requests', requestId, {
        completedAt: Date.now(),
        status: 'completed',
      })
      console.log('streamText complete', { requestId })
    } catch (error) {
      console.error({ error, requestId })
      const status = abort.signal.aborted ? 'cancelled' : 'error'
      store.setPartialRow('requests', requestId, {
        completedAt: Date.now(),
        errorMessage: String(error),
        status,
      })
    } finally {
      controllers.delete(requestId)
    }
  }

  return {
    cancel(requestId) {
      controllers.get(requestId)?.abort('user-cancel')
    },

    execute(sessionId, { config, content, onSnapshot }) {
      // Caller config overrides session config; both are validated at this boundary
      const validConfig = ModelConfig.parse({ ...sessions.getConfig(sessionId), ...config })

      // Write user message and assistant placeholder synchronously before the async stream
      // starts — so they're visible in the store immediately after execute() returns.
      sessions.addMessage(sessionId, { content, role: 'user' })
      const assistantMessageId = sessions.addMessage(sessionId, { content: '', role: 'assistant' })

      // Write the request record synchronously — callers read assistantMessageId from it
      const requestId = generateId.request()
      const abort = new AbortController()
      controllers.set(requestId, abort)
      store.setRow('requests', requestId, {
        assistantMessageId,
        config: validConfig,
        createdAt: Date.now(),
        errorMessage: '',
        sessionId,
        status: 'streaming',
      })

      // Fire-and-forget — runStream writes all outcomes to TinyBase (completed/error/cancelled)
      void runStream(requestId, sessionId, assistantMessageId, validConfig, abort, onSnapshot)

      return { assistantMessageId, requestId }
    },

    recover() {
      // Any request still marked 'streaming' at startup was interrupted — mark as error
      for (const sessionId of store.getRowIds('sessions')) {
        for (const requestId of indexes.getSliceRowIds('requestsBySession', sessionId)) {
          if (store.getCell('requests', requestId, 'status') === 'streaming') {
            store.setPartialRow('requests', requestId, {
              errorMessage: 'Request interrupted (process restart)',
              status: 'error',
            })
          }
        }
      }
    },
  }
}
