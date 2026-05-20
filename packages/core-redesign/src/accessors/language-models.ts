import { LanguageModelRecord } from '#db'
import type { Rows, TetraDb } from '#db'

export class LanguageModelAccessors {
  private readonly db: TetraDb

  constructor(db: TetraDb) {
    this.db = db
  }

  delete(modelId: string): void {
    this.db.store.delRow('languageModels', modelId)
  }

  exists(modelId: string): boolean {
    return this.db.store.hasRow('languageModels', modelId)
  }

  get(modelId: string): Rows.LanguageModel {
    if (!this.exists(modelId)) {
      throw new Error(`Language model not found: ${modelId}`)
    }

    const row = this.db.store.getRow('languageModels', modelId)
    return {
      ...LanguageModelRecord.parse(row),
      id: modelId,
    }
  }

  ids(): string[] {
    return this.db.store.getRowIds('languageModels')
  }

  lastCatalogRefreshAt(): number {
    return this.db.store.getValue('catalogLastRefreshed')
  }

  list(): Rows.LanguageModel[] {
    return this.ids().map((modelId) => this.get(modelId))
  }

  markCatalogRefreshed(): void {
    this.db.store.setValue('catalogLastRefreshed', Date.now())
  }

  replaceAll(models: Rows.LanguageModel[]): void {
    const incomingIds = new Set(models.map((model) => model.id))

    this.db.store.transaction(() => {
      for (const modelId of this.ids()) {
        if (!incomingIds.has(modelId)) {
          this.delete(modelId)
        }
      }

      for (const model of models) {
        this.upsert(model.id, model)
      }
    })
  }

  upsert(modelId: string, record: LanguageModelRecord): void {
    this.db.store.setRow('languageModels', modelId, LanguageModelRecord.parse(record))
  }
}
