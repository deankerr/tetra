import type { SessionConfig } from '@tetra/runtime'
import { sessionConfigSchema } from '@tetra/runtime'
import { useCallback, useMemo } from 'react'
import type { Store } from 'tinybase'
import { createStore } from 'tinybase'
import { createLocalPersister } from 'tinybase/persisters/persister-browser'
import { useCell, useCellState, useRow, useStore, useValue, useValueState } from 'tinybase/ui-react'

import { DEFAULT_SESSION_CONFIG } from '@/lib/constants'

// --- Store ID ---

export const UI = 'ui' as const

// --- Factory ---

export const createUiStore = () => createStore()

export const createUiPersister = (store: Store) => createLocalPersister(store, 'tetra-ui')

// --- Hook Wrappers ---
// Hard-code 'ui' store ID so callers can't accidentally hit the core store.

export const useUiStore = () => useStore(UI)
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

// --- API Key Hook ---

export const useApiKey = (): [string, (v: string) => void] => {
  const [value, setter] = useValueState('openrouterApiKey', UI)
  const str = typeof value === 'string' ? value : ''
  return [str, setter]
}

export const getApiKey = (uiStore: Store): string => {
  const value = uiStore.getValue('openrouterApiKey')
  return typeof value === 'string' ? value : ''
}

// --- Draft Cell Hook ---
// Narrowed to string for draft config fields (all stored as string/number scalars).

export const useDraftCell = (sessionId: string, cellId: string): [string, (v: string) => void] => {
  const [value, setter] = useCellState('drafts', sessionId, cellId, UI)
  // Draft cells are always written as strings via initDraft. Non-string is unexpected.
  const str = typeof value === 'string' ? value : ''
  return [str, setter]
}

// --- Draft Provider Options Hook ---
// providerOptions is stored as a JSON string in TinyBase (cells are primitives).

export const useDraftProviderOptions = (
  sessionId: string,
): [Record<string, unknown>, (opts: Record<string, unknown>) => void] => {
  const [raw, setRaw] = useCellState('drafts', sessionId, 'providerOptions', UI)

  const options = useMemo((): Record<string, unknown> => {
    if (typeof raw !== 'string') {
      return {}
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        // oxlint-disable-next-line no-unsafe-type-assertion -- JSON-parsed object
        return parsed as Record<string, unknown>
      }
      return {}
    } catch {
      return {}
    }
  }, [raw])

  const setOptions = useCallback(
    (opts: Record<string, unknown>) => {
      setRaw(JSON.stringify(opts))
    },
    [setRaw],
  )

  return [options, setOptions]
}

// --- Draft Helpers ---

/** Read draft config for a session. Falls back to DEFAULT_SESSION_CONFIG. */
export const getDraftConfig = (uiStore: Store, sessionId: string): SessionConfig => {
  const row = uiStore.getRow('drafts', sessionId)

  // Parse providerOptions from JSON string (TinyBase cells are primitives)
  let providerOptions: unknown
  if (typeof row.providerOptions === 'string') {
    try {
      providerOptions = JSON.parse(row.providerOptions)
    } catch {
      // Invalid JSON — fall through as undefined
    }
  }

  const result = sessionConfigSchema.safeParse({ ...row, providerOptions })
  if (!result.success) {
    console.error('[ui:getDraftConfig]', 'draft parse failed — using default', { row, sessionId })
  }
  return result.success ? result.data : DEFAULT_SESSION_CONFIG
}

/** Write config to drafts only if no draft exists yet (preserves in-progress edits). */
export const initDraft = (uiStore: Store, sessionId: string, config: SessionConfig) => {
  if (uiStore.hasRow('drafts', sessionId)) {
    return
  }
  uiStore.setRow('drafts', sessionId, {
    modelId: config.modelId,
    providerOptions: JSON.stringify(config.providerOptions ?? {}),
    systemPrompt: config.systemPrompt ?? '',
  })
}
