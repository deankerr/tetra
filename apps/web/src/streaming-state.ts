import type { UIMessage } from 'ai'

export class StreamingState {
  private readonly snapshots = new Map<string, UIMessage>()
  private readonly listeners = new Map<string, Set<() => void>>()

  update(messageId: string, snapshot: UIMessage): void {
    // Shallow-copy parts so useSyncExternalStore detects a reference change
    this.snapshots.set(messageId, { ...snapshot, parts: [...snapshot.parts] })
    for (const fn of this.listeners.get(messageId) ?? []) {
      fn()
    }
  }

  subscribe(messageId: string, fn: () => void): () => void {
    if (!this.listeners.has(messageId)) {
      this.listeners.set(messageId, new Set())
    }
    this.listeners.get(messageId)?.add(fn)
    return () => {
      this.listeners.get(messageId)?.delete(fn)
    }
  }

  get(messageId: string): UIMessage | null {
    return this.snapshots.get(messageId) ?? null
  }

  delete(messageId: string): void {
    this.snapshots.delete(messageId)
    for (const fn of this.listeners.get(messageId) ?? []) {
      fn()
    }
    this.listeners.delete(messageId)
  }
}
