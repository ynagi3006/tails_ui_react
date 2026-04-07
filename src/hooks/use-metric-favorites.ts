import { useCallback, useEffect, useMemo, useState } from 'react'

const FAVORITES_KEY = 'metricFavorites'

function readIds(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

function writeIds(ids: Set<string>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(ids)))
}

export function useMetricFavorites() {
  const [ids, setIds] = useState<Set<string>>(readIds)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === FAVORITES_KEY) setIds(readIds())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback((metricId: string) => {
    setIds((prev) => {
      const next = new Set(prev)
      if (next.has(metricId)) next.delete(metricId)
      else next.add(metricId)
      writeIds(next)
      return next
    })
  }, [])

  const has = useCallback((id: string) => ids.has(id), [ids])

  const count = useMemo(() => ids.size, [ids])

  return { ids, count, toggle, has }
}
