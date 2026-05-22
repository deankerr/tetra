import { createContext, useContext, useState } from 'react'

interface SettingsAppContext {
  activeCredentialId: string
  open: boolean
  openCredentialSettings: (id: string) => void
  setOpen: (open: boolean) => void
}

const SettingsContext = createContext<SettingsAppContext | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [activeCredentialId, setActiveCredentialId] = useState('')

  return (
    <SettingsContext
      value={{
        activeCredentialId,
        open,
        openCredentialSettings: (id: string) => {
          setActiveCredentialId(id)
          setOpen(true)
        },
        setOpen,
      }}
    >
      {children}
    </SettingsContext>
  )
}

export function useSettings(): SettingsAppContext {
  const ctx = useContext(SettingsContext)
  if (ctx === null) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return ctx
}
