import { createContext } from 'react'

import type { ThemePreference } from '@/lib/theme-storage'

export type ThemeContextValue = {
  preference: ThemePreference
  setPreference: (t: ThemePreference) => void
  resolved: 'light' | 'dark'
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
