import {
  getJinaApiKey,
  getOpenRouterApiKey,
  setJinaApiKey,
  setOpenRouterApiKey,
  subscribeJinaApiKey,
  subscribeOpenRouterApiKey,
} from '@tetra/key-store'
import { useSyncExternalStore } from 'react'

export function useJinaApiKey(): [string, (value: string) => void] {
  const value = useSyncExternalStore(subscribeJinaApiKey, getJinaApiKey, () => '')
  return [value, setJinaApiKey]
}

export function useOpenRouterApiKey(): [string, (value: string) => void] {
  const value = useSyncExternalStore(subscribeOpenRouterApiKey, getOpenRouterApiKey, () => '')
  return [value, setOpenRouterApiKey]
}
