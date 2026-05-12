import {
  getOpenRouterApiKey,
  setOpenRouterApiKey,
  subscribeOpenRouterApiKey,
} from '@tetra/key-store'
import { useSyncExternalStore } from 'react'

export function useOpenRouterApiKey(): [string, (value: string) => void] {
  const value = useSyncExternalStore(subscribeOpenRouterApiKey, getOpenRouterApiKey, () => '')
  return [value, setOpenRouterApiKey]
}
