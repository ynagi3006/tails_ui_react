/** Keep in sync with the inline script in index.html. */
export const THEME_STORAGE_KEY = 'tails-ui-theme'

export type ThemePreference = 'light' | 'dark' | 'system'

export function readStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'system'
}

export function writeStoredTheme(theme: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

export function getSystemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function isResolvedDark(preference: ThemePreference, systemDark: boolean): boolean {
  if (preference === 'dark') return true
  if (preference === 'light') return false
  return systemDark
}

export function applyThemeToDocument(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}
