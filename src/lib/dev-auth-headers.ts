/**
 * Same localStorage keys as tails_ui `auth-dev.js` (TAILS_AUTH_MODE=dev_headers / Okta Bearer).
 */
export const DEV_AUTH_STORAGE_KEYS = {
  sub: 'tailsDevSub',
  email: 'tailsDevEmail',
  token: 'tailsOktaAccessToken',
} as const

export type DevAuthValues = {
  email: string
  sub: string
  token: string
}

export function loadDevAuthFromStorage(): DevAuthValues {
  try {
    return {
      email: (localStorage.getItem(DEV_AUTH_STORAGE_KEYS.email) || '').trim(),
      sub: (localStorage.getItem(DEV_AUTH_STORAGE_KEYS.sub) || '').trim(),
      token: (localStorage.getItem(DEV_AUTH_STORAGE_KEYS.token) || '').trim(),
    }
  } catch {
    return { email: '', sub: '', token: '' }
  }
}

export function saveDevAuthToStorage(values: DevAuthValues): void {
  const e = (values.email || '').trim()
  const s = (values.sub || '').trim()
  const t = (values.token || '').trim()
  try {
    if (e) localStorage.setItem(DEV_AUTH_STORAGE_KEYS.email, e)
    else localStorage.removeItem(DEV_AUTH_STORAGE_KEYS.email)
    if (s) localStorage.setItem(DEV_AUTH_STORAGE_KEYS.sub, s)
    else localStorage.removeItem(DEV_AUTH_STORAGE_KEYS.sub)
    if (t) localStorage.setItem(DEV_AUTH_STORAGE_KEYS.token, t)
    else localStorage.removeItem(DEV_AUTH_STORAGE_KEYS.token)
  } catch {
    /* quota / private mode */
  }
}

export function clearDevAuthStorage(): void {
  try {
    localStorage.removeItem(DEV_AUTH_STORAGE_KEYS.sub)
    localStorage.removeItem(DEV_AUTH_STORAGE_KEYS.email)
    localStorage.removeItem(DEV_AUTH_STORAGE_KEYS.token)
  } catch {
    /* ignore */
  }
}

export function getDevAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const { email, sub, token } = loadDevAuthFromStorage()
  if (email) {
    headers['Tails-Profile-Email'] = email
    headers['X-Tails-Email'] = email
  }
  if (sub) {
    headers['Tails-User-Id'] = sub
    headers['X-Tails-Sub'] = sub
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}
