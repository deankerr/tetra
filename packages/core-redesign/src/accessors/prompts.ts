import type { Rows, TetraDb } from '#db'

import { createIdGenerator } from './ids'

export class PromptAccessors {
  private readonly db: TetraDb
  private readonly nextId = createIdGenerator('prpt')

  constructor(db: TetraDb) {
    this.db = db
  }

  create(args: { content?: string; label?: string } = {}): string {
    const promptId = this.nextId()

    this.db.store.setRow('prompts', promptId, {
      content: args.content ?? '',
      label: args.label ?? '',
    })

    return promptId
  }

  delete(promptId: string): void {
    this.db.store.delRow('prompts', promptId)
  }

  get(promptId: string): Rows.Prompt {
    if (!this.exists(promptId)) {
      throw new Error(`Prompt not found: ${promptId}`)
    }

    const row = this.db.store.getRow('prompts', promptId)
    return {
      content: row.content,
      id: promptId,
      label: row.label,
    }
  }

  ids(): string[] {
    return this.db.store.getRowIds('prompts')
  }

  list(): Rows.Prompt[] {
    return this.ids()
      .map((promptId) => this.get(promptId))
      .toSorted((a, b) => a.id.localeCompare(b.id))
  }

  update(promptId: string, patch: { content?: string; label?: string }): void {
    this.get(promptId)
    this.db.store.setPartialRow('prompts', promptId, patch)
  }

  private exists(promptId: string): boolean {
    return this.db.store.hasRow('prompts', promptId)
  }
}
