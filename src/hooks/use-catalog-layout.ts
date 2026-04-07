import { useCallback, useState } from 'react'

export type CatalogLayoutMode = 'list' | 'cards'

export function useCatalogLayout(storageKey: string) {
  const [layout, setLayoutState] = useState<CatalogLayoutMode>(() => {
    if (typeof window === 'undefined') return 'list'
    try {
      const v = window.localStorage.getItem(storageKey)
      return v === 'cards' ? 'cards' : 'list'
    } catch {
      return 'list'
    }
  })

  const setLayout = useCallback(
    (next: CatalogLayoutMode) => {
      setLayoutState(next)
      try {
        window.localStorage.setItem(storageKey, next)
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  )

  return [layout, setLayout] as const
}
