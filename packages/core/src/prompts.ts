import type { LibraryStoreInstance, LibraryTypedStore } from '@tetra/stores/library'

import { createIdGenerator } from '#ids'
import type { RunConfigs } from '#run-configs'

// Prompts owns stored prompt records: creation, deletion, and resolving a
// system prompt id to prompt content at run start.
export class Prompts {
  private readonly nextPromptId = createIdGenerator('prpt')
  private readonly runConfigs: RunConfigs
  private readonly typedStore: LibraryTypedStore

  constructor({
    libraryStore,
    runConfigs,
  }: {
    libraryStore: LibraryStoreInstance
    runConfigs: RunConfigs
  }) {
    this.runConfigs = runConfigs
    this.typedStore = libraryStore.typedStore
  }

  createPrompt(args: { content?: string; label?: string } = {}): string {
    const promptId = this.nextPromptId()
    const now = Date.now()

    this.typedStore.tables.prompts.setRow(promptId, {
      content: args.content ?? '',
      createdAt: now,
      label: args.label ?? '',
      updatedAt: now,
    })

    return promptId
  }

  // Removes the prompt and asks RunConfigs to unlink it from session configs.
  // TinyBase transactions nest, so the unlink merges into this transaction.
  deletePrompt(promptId: string): void {
    this.typedStore.tables.prompts.requireEntity(promptId)

    this.typedStore.transaction(() => {
      this.runConfigs.unlinkPrompt(promptId)
      this.typedStore.tables.prompts.deleteRow(promptId)
    })
  }

  // Resolves a system prompt id to its content; '' is the "no prompt" sentinel.
  resolveContent(systemPromptId: string): string | undefined {
    if (systemPromptId === '') {
      return undefined
    }

    return this.typedStore.tables.prompts.requireEntity(systemPromptId).content
  }
}
