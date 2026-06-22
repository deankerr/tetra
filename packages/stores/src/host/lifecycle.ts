export type PersistencePlan =
  | {
      kind: 'durable-object-sql'
    }
  | {
      databaseName: string
      kind: 'indexed-db'
    }
  | {
      kind: 'sqlite'
      path: string
    }

export interface StoreLifecyclePlan {
  persistence?: PersistencePlan
  storeId: string
  sync?: {
    kind: 'websocket'
    url: string
  }
}

export function describeLifecyclePlans(plans: readonly StoreLifecyclePlan[]): string[] {
  return plans.map((plan) => {
    let persistence = 'no persistence'
    if (plan.persistence?.kind === 'indexed-db') {
      persistence = `IndexedDB:${plan.persistence.databaseName}`
    }
    if (plan.persistence?.kind === 'sqlite') {
      persistence = `SQLite:${plan.persistence.path}`
    }
    if (plan.persistence?.kind === 'durable-object-sql') {
      persistence = 'DurableObjectSQL'
    }

    const sync = plan.sync === undefined ? 'no sync' : `sync:${plan.sync.url}`
    return `${plan.storeId} -> ${persistence}, ${sync}`
  })
}
