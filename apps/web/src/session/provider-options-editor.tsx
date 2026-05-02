import { BracesIcon, PlusIcon, XIcon } from 'lucide-react'
import { useEffect, useReducer, useRef } from 'react'
import type { Dispatch } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDraftProviderOptions } from '@/local-store/ui'

// --- Types ---

interface ScalarEntry {
  id: string
  key: string
  type: 'scalar'
  value: string
}

interface ObjectEntry {
  id: string
  children: ScalarEntry[]
  key: string
  type: 'object'
}

type Entry = ObjectEntry | ScalarEntry

type Action =
  | { field: 'key' | 'value'; id: string; type: 'update'; value: string }
  | { id: string; type: 'remove' }
  | { type: 'add-scalar' }
  | { type: 'add-object' }
  | { id: string; type: 'update-key'; value: string }
  | { childId: string; field: 'key' | 'value'; id: string; type: 'update-child'; value: string }
  | { childId: string; id: string; type: 'remove-child' }
  | { id: string; type: 'add-child' }
  | { entries: Entry[]; type: 'reset' }

// --- Parsing ---

// Parse input string to a typed value. Commas signal a string array; numbers and booleans are
// preserved via JSON.parse; everything else stays as a string.
function parseValue(str: string): unknown {
  const trimmed = str.trim()
  if (trimmed === '') {
    return ''
  }
  // Comma presence → string array, filter empty segments
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return str
  }
}

function displayValue(val: unknown): string {
  if (Array.isArray(val)) {
    return val.join(', ')
  }
  if (typeof val === 'string') {
    return val
  }
  return JSON.stringify(val)
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

// --- Conversions ---

function optionsToEntries(options: Record<string, unknown>): Entry[] {
  return Object.entries(options).map(([key, value]) => {
    if (isPlainObject(value)) {
      return {
        children: Object.entries(value).map(([k, v]) => ({
          id: crypto.randomUUID(),
          key: k,
          type: 'scalar' as const,
          value: displayValue(v),
        })),
        id: crypto.randomUUID(),
        key,
        type: 'object' as const,
      }
    }
    return {
      id: crypto.randomUUID(),
      key,
      type: 'scalar' as const,
      value: displayValue(value),
    }
  })
}

function entriesToOptions(entries: Entry[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const entry of entries) {
    const k = entry.key.trim()
    if (!k) {
      continue
    }
    if (entry.type === 'scalar') {
      result[k] = parseValue(entry.value)
    } else {
      const obj: Record<string, unknown> = {}
      for (const child of entry.children) {
        const ck = child.key.trim()
        if (ck) {
          obj[ck] = parseValue(child.value)
        }
      }
      result[k] = obj
    }
  }
  return result
}

// --- Reducer ---

function entriesReducer(state: Entry[], action: Action): Entry[] {
  switch (action.type) {
    case 'reset': {
      return action.entries
    }

    case 'add-scalar': {
      return [...state, { id: crypto.randomUUID(), key: '', type: 'scalar', value: '' }]
    }

    case 'add-object': {
      return [...state, { children: [], id: crypto.randomUUID(), key: '', type: 'object' }]
    }

    case 'remove': {
      return state.filter((e) => e.id !== action.id)
    }

    // Update key or value on a scalar entry
    case 'update': {
      return state.map((e) => (e.id === action.id ? { ...e, [action.field]: action.value } : e))
    }

    // Update the key on an object entry
    case 'update-key': {
      return state.map((e) => (e.id === action.id ? { ...e, key: action.value } : e))
    }

    case 'add-child': {
      return state.map((e) => {
        if (e.id !== action.id || e.type !== 'object') {
          return e
        }
        return {
          ...e,
          children: [
            ...e.children,
            { id: crypto.randomUUID(), key: '', type: 'scalar' as const, value: '' },
          ],
        }
      })
    }

    case 'remove-child': {
      return state.map((e) => {
        if (e.id !== action.id || e.type !== 'object') {
          return e
        }
        return { ...e, children: e.children.filter((c) => c.id !== action.childId) }
      })
    }

    case 'update-child': {
      return state.map((e) => {
        if (e.id !== action.id || e.type !== 'object') {
          return e
        }
        return {
          ...e,
          children: e.children.map((c) =>
            c.id === action.childId ? { ...c, [action.field]: action.value } : c,
          ),
        }
      })
    }

    default: {
      return action satisfies never
    }
  }
}

// --- Rows ---

function ScalarRow({ dispatch, entry }: { dispatch: Dispatch<Action>; entry: ScalarEntry }) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        className="flex-1 font-mono"
        onChange={(e) => {
          dispatch({ field: 'key', id: entry.id, type: 'update', value: e.target.value })
        }}
        placeholder="key"
        value={entry.key}
      />
      <Input
        className="flex-1 font-mono"
        onChange={(e) => {
          dispatch({ field: 'value', id: entry.id, type: 'update', value: e.target.value })
        }}
        placeholder="value"
        value={entry.value}
      />
      <Button
        onClick={() => {
          dispatch({ id: entry.id, type: 'remove' })
        }}
        size="icon-xs"
        variant="ghost"
      >
        <XIcon />
      </Button>
    </div>
  )
}

function ObjectRow({ dispatch, entry }: { dispatch: Dispatch<Action>; entry: ObjectEntry }) {
  return (
    <div className="flex flex-col gap-1.5 mb-1">
      {/* Group header */}
      <div className="flex items-center gap-1.5">
        <Input
          className="flex-1 font-mono"
          onChange={(e) => {
            dispatch({ id: entry.id, type: 'update-key', value: e.target.value })
          }}
          placeholder="key"
          value={entry.key}
        />
        <Button
          onClick={() => {
            dispatch({ id: entry.id, type: 'remove' })
          }}
          size="icon-xs"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </div>
      {/* Children */}
      <div className="ml-3 flex flex-col gap-1.5 border-l border-border pl-3">
        {entry.children.map((child) => (
          <div key={child.id} className="flex items-center gap-1.5">
            <Input
              className="flex-1 font-mono"
              onChange={(e) => {
                dispatch({
                  childId: child.id,
                  field: 'key',
                  id: entry.id,
                  type: 'update-child',
                  value: e.target.value,
                })
              }}
              placeholder="key"
              value={child.key}
            />
            <Input
              className="flex-1 font-mono"
              onChange={(e) => {
                dispatch({
                  childId: child.id,
                  field: 'value',
                  id: entry.id,
                  type: 'update-child',
                  value: e.target.value,
                })
              }}
              placeholder="value"
              value={child.value}
            />
            <Button
              onClick={() => {
                dispatch({ childId: child.id, id: entry.id, type: 'remove-child' })
              }}
              size="icon-xs"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </div>
        ))}
        <Button
          className="self-start"
          onClick={() => {
            dispatch({ id: entry.id, type: 'add-child' })
          }}
          size="sm"
          variant="ghost"
        >
          <PlusIcon />
          Value
        </Button>
      </div>
    </div>
  )
}

// --- Editor ---

export function ProviderOptionsEditor({ sessionId }: { sessionId: string }) {
  const [options, setOptions] = useDraftProviderOptions(sessionId)
  const [entries, dispatch] = useReducer(entriesReducer, options, optionsToEntries)
  const prevSessionId = useRef(sessionId)
  const isInitialRender = useRef(true)

  // Re-sync entries when session changes
  useEffect(() => {
    if (prevSessionId.current !== sessionId) {
      dispatch({ entries: optionsToEntries(options), type: 'reset' })
      prevSessionId.current = sessionId
      // Skip the sync-back for this reset too
      isInitialRender.current = true
    }
  }, [sessionId, options])

  // Sync entries → options on every change (skip initial mount)
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }
    setOptions(entriesToOptions(entries))
  }, [entries, setOptions])

  return (
    <div className="flex flex-col gap-1.5">
      {entries.map((entry) =>
        entry.type === 'scalar' ? (
          <ScalarRow key={entry.id} dispatch={dispatch} entry={entry} />
        ) : (
          <ObjectRow key={entry.id} dispatch={dispatch} entry={entry} />
        ),
      )}
      <div className="flex gap-1">
        <Button
          className="self-start"
          onClick={() => {
            dispatch({ type: 'add-scalar' })
          }}
          size="sm"
          variant="ghost"
        >
          <PlusIcon />
          Value
        </Button>
        <Button
          className="self-start"
          onClick={() => {
            dispatch({ type: 'add-object' })
          }}
          size="sm"
          variant="ghost"
        >
          <BracesIcon />
          Group
        </Button>
      </div>
    </div>
  )
}
