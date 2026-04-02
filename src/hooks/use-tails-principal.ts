import { useCallback, useEffect, useState } from 'react'

import { getApiBaseUrl } from '@/config/env'
import { DEV_AUTH_STORAGE_KEYS, getDevAuthHeaders } from '@/lib/dev-auth-headers'

type PrincipalPayload = {
  is_admin?: boolean
  [key: string]: unknown
}

async function fetchPrincipalJson(): Promise<{ ok: boolean; data: unknown }> {
  const root = getApiBaseUrl()
  if (!root) return { ok: false, data: { error: 'VITE_TAILS_API_URL is not set' } }
  try {
    const r = await fetch(`${root}/api/v1/users/me/principal`, {
      headers: { Accept: 'application/json', ...getDevAuthHeaders() },
    })
    const text = await r.text()
    let data: unknown = text
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      /* leave as string */
    }
    return { ok: r.ok, data }
  } catch (e) {
    return { ok: false, data: { error: String(e instanceof Error ? e.message : e) } }
  }
}

function applyPrincipalPayload(ok: boolean, data: unknown, setIsAdmin: (v: boolean) => void) {
  if (ok && data && typeof data === 'object' && data !== null) {
    setIsAdmin((data as PrincipalPayload).is_admin === true)
  } else {
    setIsAdmin(false)
  }
}

export function useTailsPrincipal() {
  const [isAdmin, setIsAdmin] = useState(false)

  const refreshPrincipal = useCallback(async () => {
    const { ok, data } = await fetchPrincipalJson()
    applyPrincipalPayload(ok, data, setIsAdmin)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { ok, data } = await fetchPrincipalJson()
      if (!cancelled) applyPrincipalPayload(ok, data, setIsAdmin)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === DEV_AUTH_STORAGE_KEYS.email ||
        e.key === DEV_AUTH_STORAGE_KEYS.sub ||
        e.key === DEV_AUTH_STORAGE_KEYS.token
      ) {
        void refreshPrincipal()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refreshPrincipal])

  return { isAdmin, refreshPrincipal }
}
