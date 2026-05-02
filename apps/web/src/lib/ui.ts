import type { SessionConfig } from '@tetra/store'
import { sessionConfigSchema } from '@tetra/store'
import type { Store } from 'tinybase'
import { useCell, useCellState, useRow, useStore, useValue, useValueState } from 'tinybase/ui-react'

import { DEFAULT_SESSION_CONFIG } from '@/lib/constants'

// --- Store ID ---

export const UI = 'ui' as const

// --- Hook Wrappers ---
// Hard-code 'ui' store ID so callers can't accidentally hit the runtime store.

export const useUiStore = (): Store => {
  const store = useStore(UI)
  if (store === undefined) {
    throw new Error(
      'UI store not found — is the component inside <Provider storesById={{ ui: ... }}>?',
    )
  }
  return store
}
export const useUiValue = (valueId: string) => useValue(valueId, UI)
export const useUiValueState = (valueId: string) => useValueState(valueId, UI)
export const useUiCell = (tableId: string, rowId: string, cellId: string) =>
  useCell(tableId, rowId, cellId, UI)
export const useUiCellState = (tableId: string, rowId: string, cellId: string) =>
  useCellState(tableId, rowId, cellId, UI)
export const useUiRow = (tableId: string, rowId: string) => useRow(tableId, rowId, UI)

// --- Active Session ---

export const useActiveSessionId = () => {
  const value = useUiValue('activeSessionId')
  return typeof value === 'string' ? value : undefined
}

// --- Draft Cell Hook ---
// Narrowed to string for draft config fields (all stored as string/number scalars).

export const useDraftCell = (sessionId: string, cellId: string): [string, (v: string) => void] => {
  const [value, setter] = useCellState('drafts', sessionId, cellId, UI)
  // Draft cells are always strings. Non-string is unexpected — fall back to empty.
  const str = typeof value === 'string' ? value : ''
  return [str, setter]
}

// --- Draft Provider Options Hook ---
// TinyBase v8 supports native object cells — no JSON serialization needed.

export const useDraftProviderOptions = (
  sessionId: string,
): [Record<string, unknown>, (opts: Record<string, unknown>) => void] => {
  const [value, setter] = useCellState('drafts', sessionId, 'providerOptions', UI)
  const isObject = typeof value === 'object' && value !== null && !Array.isArray(value)
  // oxlint-disable-next-line no-unsafe-type-assertion -- we only write plain objects to this cell
  const options: Record<string, unknown> = isObject ? (value as Record<string, unknown>) : {}
  return [options, setter]
}

// --- Draft Helpers ---

/** Read draft config for a session. Falls back to DEFAULT_SESSION_CONFIG. */
export const getDraftConfig = (uiStore: Store, sessionId: string): SessionConfig => {
  const row = uiStore.getRow('drafts', sessionId)
  const result = sessionConfigSchema.safeParse(row)
  if (!result.success) {
    console.error('[ui:getDraftConfig]', 'draft parse failed — using default', { row, sessionId })
  }
  return result.success ? result.data : DEFAULT_SESSION_CONFIG
}

// --- Store Setup ---

/** Wire listeners on the UI store. Call once after creation. */
export const setupUiStore = (store: Store) => {
  // When the active session changes, ensure a draft config row exists with defaults.
  // Mutator flag allows writing back to the store within the same transaction.
  store.addValueListener(
    'activeSessionId',
    (s, _valueId, newValue) => {
      if (typeof newValue !== 'string' || newValue === '') {
        return
      }
      if (s.hasRow('drafts', newValue)) {
        return
      }
      s.setRow('drafts', newValue, {
        modelId: DEFAULT_SESSION_CONFIG.modelId,
        providerOptions: DEFAULT_SESSION_CONFIG.providerOptions ?? {},
        systemPrompt: DEFAULT_SESSION_CONFIG.systemPrompt ?? '',
      })
    },
    true,
  )
}
