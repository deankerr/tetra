import type { UIMessage } from 'ai'

import type { Accessors } from '#accessors'
import { Execute } from '#execute'
import type { CredentialReader, ExecuteArgs } from '#execute'
import { Runner } from '#runner'

const DURABLE_SNAPSHOT_INTERVAL_MS = 500

export interface RunArgs extends ExecuteArgs {
  onSnapshot?: (message: UIMessage) => void
}

export interface RunHandle {
  assistantMessageId: string
  cancel(): void
  done: Promise<void>
  requestId: string
}

interface ActiveRun {
  abortController: AbortController
  assistantMessageId: string
  done: Promise<void>
  lastDurableWriteAt: number
  requestId: string
}

export class Runs {
  private readonly accessors: Accessors
  private readonly executeAction: Execute
  private readonly listeners = new Map<string, Set<() => void>>()
  private readonly snapshots = new Map<string, UIMessage>()
  private readonly active = new Map<string, ActiveRun>()

  constructor(accessors: Accessors, credentials: CredentialReader) {
    this.accessors = accessors
    this.executeAction = new Execute(accessors, credentials)
  }

  cancel(requestId: string): void {
    this.active.get(requestId)?.abortController.abort('user-cancel')
  }

  async execute(sessionId: string, args: RunArgs): Promise<RunHandle> {
    const prepared = await this.executeAction.prepare(sessionId, args)
    const activeRun: ActiveRun = {
      abortController: prepared.abortController,
      assistantMessageId: prepared.assistantMessageId,
      done: Promise.resolve(),
      lastDurableWriteAt: 0,
      requestId: prepared.requestId,
    }

    const runner = new Runner(prepared.input, {
      onComplete: (parts) => {
        this.accessors.messages.update(prepared.assistantMessageId, { parts })
        this.accessors.requests.complete(prepared.requestId)
      },
      onError: (error) => {
        if (prepared.abortController.signal.aborted) {
          this.accessors.requests.cancel(prepared.requestId, 'Request cancelled')
          return
        }

        this.accessors.requests.fail(prepared.requestId, error)
      },
      onSnapshot: (message) => {
        this.updateSnapshot(prepared.assistantMessageId, message)
        args.onSnapshot?.(message)
        this.writeDurableSnapshot(activeRun, message)
      },
      onStep: (step) => {
        this.accessors.requests.appendStep(prepared.requestId, step)
      },
    })

    this.active.set(prepared.requestId, activeRun)
    activeRun.done = this.runAndCleanUp({
      assistantMessageId: prepared.assistantMessageId,
      requestId: prepared.requestId,
      runner,
    })

    return {
      assistantMessageId: prepared.assistantMessageId,
      cancel: () => {
        this.cancel(prepared.requestId)
      },
      done: activeRun.done,
      requestId: prepared.requestId,
    }
  }

  getSnapshot(messageId: string): UIMessage | null {
    return this.snapshots.get(messageId) ?? null
  }

  recover(): void {
    this.accessors.requests.recoverInterrupted('Request interrupted')
  }

  subscribeSnapshot(messageId: string, fn: () => void): () => void {
    const listeners = this.listeners.get(messageId) ?? new Set<() => void>()
    listeners.add(fn)
    this.listeners.set(messageId, listeners)

    return () => {
      this.listeners.get(messageId)?.delete(fn)
    }
  }

  private deleteSnapshot(messageId: string): void {
    this.snapshots.delete(messageId)
    this.notifySnapshot(messageId)
    this.listeners.delete(messageId)
  }

  private notifySnapshot(messageId: string): void {
    for (const fn of this.listeners.get(messageId) ?? []) {
      fn()
    }
  }

  private async runAndCleanUp(args: {
    assistantMessageId: string
    requestId: string
    runner: Runner
  }): Promise<void> {
    try {
      await args.runner.run()
    } finally {
      this.active.delete(args.requestId)
      this.deleteSnapshot(args.assistantMessageId)
    }
  }

  private updateSnapshot(messageId: string, snapshot: UIMessage): void {
    this.snapshots.set(messageId, { ...snapshot, parts: [...snapshot.parts] })
    this.notifySnapshot(messageId)
  }

  private writeDurableSnapshot(activeRun: ActiveRun, message: UIMessage): void {
    const now = Date.now()
    if (now - activeRun.lastDurableWriteAt < DURABLE_SNAPSHOT_INTERVAL_MS) {
      return
    }

    this.accessors.messages.update(activeRun.assistantMessageId, { parts: message.parts })
    activeRun.lastDurableWriteAt = now
  }
}
