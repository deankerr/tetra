import { useNavigate, useSearch } from '@tanstack/react-router'

export const useOpenSessionIds = (): string[] => {
  const search = useSearch({ from: '/' })
  return search.sessions ?? []
}

export const useSetOpenSessionIds = () => {
  const navigate = useNavigate({ from: '/' })
  return (sessionIds: string[]) => {
    void navigate({
      search: (current) => ({
        ...current,
        sessions: sessionIds.length > 0 ? sessionIds : undefined,
      }),
    })
  }
}
