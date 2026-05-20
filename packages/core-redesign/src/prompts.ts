import type { Accessors } from '#accessors'
import type { Rows } from '#db'

export class Prompts {
  private readonly accessors: Accessors

  constructor(accessors: Accessors) {
    this.accessors = accessors
  }

  create(args: { content?: string; label?: string } = {}): string {
    return this.accessors.prompts.create(args)
  }

  delete(promptId: string): void {
    this.accessors.transaction(() => {
      for (const session of this.accessors.sessions.list()) {
        const config = this.accessors.sessions.getConfig(session.id)
        if (config.systemPromptId !== promptId) {
          continue
        }

        const { systemPromptId: _systemPromptId, ...nextConfig } = config
        this.accessors.sessions.setConfig(session.id, nextConfig)
      }

      this.accessors.prompts.delete(promptId)
    })
  }

  get(promptId: string): Rows.Prompt {
    return this.accessors.prompts.get(promptId)
  }

  list(): Rows.Prompt[] {
    return this.accessors.prompts.list()
  }

  update(promptId: string, patch: { content?: string; label?: string }): void {
    this.accessors.prompts.update(promptId, patch)
  }
}
