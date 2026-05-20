import type { JSONObject } from '@ai-sdk/provider'
import { readUIMessageStream, stepCountIs, streamText } from 'ai'
import type { LanguageModel, ModelMessage, UIMessage, ToolSet } from 'ai'

import type { RequestConfig, StepRecord } from '#db'

import { parseStep } from './steps'

export interface RunnerInput {
  abortSignal: AbortSignal
  config: RequestConfig
  messages: ModelMessage[]
  model: LanguageModel
  providerOptions: JSONObject
  system?: string
  tools: ToolSet
}

export interface RunnerEvents {
  onComplete(parts: UIMessage['parts']): void
  onError(error: unknown): void
  onSnapshot(message: UIMessage): void
  onStep(step: StepRecord): void
}

export class Runner {
  private readonly events: RunnerEvents
  private readonly input: RunnerInput

  constructor(input: RunnerInput, events: RunnerEvents) {
    this.events = events
    this.input = input
  }

  async run(): Promise<void> {
    try {
      const result = streamText({
        abortSignal: this.input.abortSignal,
        messages: this.input.messages,
        model: this.input.model,
        onStepFinish: (step) => {
          this.events.onStep(parseStep(step))
        },
        providerOptions: { openrouter: this.input.providerOptions },
        stopWhen: stepCountIs(6),
        system: this.input.system,
        tools: this.input.tools,
      })

      let finalParts: UIMessage['parts'] = []
      for await (const message of readUIMessageStream({
        stream: result.toUIMessageStream({ sendReasoning: true }),
      })) {
        finalParts = message.parts
        this.events.onSnapshot(message)
      }

      this.events.onComplete(finalParts)
    } catch (error) {
      this.events.onError(error)
    }
  }
}
