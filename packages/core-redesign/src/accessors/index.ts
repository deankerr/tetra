import type { TetraDb } from '#db'

import { LanguageModelAccessors } from './language-models'
import { MessageAccessors } from './messages'
import { PromptAccessors } from './prompts'
import { RequestAccessors } from './requests'
import { SessionAccessors } from './sessions'

export class Accessors {
  readonly languageModels: LanguageModelAccessors
  readonly messages: MessageAccessors
  readonly prompts: PromptAccessors
  readonly requests: RequestAccessors
  readonly sessions: SessionAccessors
  readonly db: TetraDb

  constructor(db: TetraDb) {
    this.db = db
    this.languageModels = new LanguageModelAccessors(db)
    this.messages = new MessageAccessors(db)
    this.prompts = new PromptAccessors(db)
    this.requests = new RequestAccessors(db)
    this.sessions = new SessionAccessors(db)
  }

  transaction(fn: () => void): void {
    this.db.store.transaction(fn)
  }
}

export { LanguageModelAccessors } from './language-models'
export { MessageAccessors } from './messages'
export { PromptAccessors } from './prompts'
export { RequestAccessors } from './requests'
export { SessionAccessors } from './sessions'
