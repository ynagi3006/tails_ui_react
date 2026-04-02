import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ThemeContext } from '@/components/theme-context'
import {
  applyThemeToDocument,
  getSystemPrefersDark,
  isResolvedDark,
  readStoredTheme,
  writeStoredTheme,
  type ThemePreference,
} from '@/lib/theme-storage'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredTheme())
  const [systemDark, setSystemDark] = useState(() => getSystemPrefersDark())

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolvedDark = isResolvedDark(preference, systemDark)

  useEffect(() => {
    applyThemeToDocument(resolvedDark)
  }, [resolvedDark])

  const setPreference = useCallback((t: ThemePreference) => {
    writeStoredTheme(t)
    setPreferenceState(t)
  }, [])

  const value = useMemo(
    () => ({
      preference,
      setPreference,
      resolved: resolvedDark ? ('dark' as const) : ('light' as const),
    }),
    [preference, setPreference, resolvedDark],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
