import { useCallback, useEffect, useState } from 'react'

import { getApiBaseUrl, isUiAuthDisabled } from '@/config/env'
import { getApiAuthHeaders, TAILS_AUTH_CHANGED_EVENT } from '@/lib/api-auth-headers'

type PrincipalPayload = {
  is_admin?: boolean
  [key: string]: unknown
}

async function fetchPrincipalJson(): Promise<{ ok: boolean; data: unknown }> {
  const root = getApiBaseUrl()
  if (!root) return { ok: false, data: { error: 'VITE_TAILS_API_URL is not set' } }
  try {
    const r = await fetch(`${root}/api/v1/users/me/principal`, {
      headers: { Accept: 'application/json', ...(await getApiAuthHeaders()) },
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
  if (isUiAuthDisabled()) {
    setIsAdmin(true)
    return
  }
  if (ok && data && typeof data === 'object' && data !== null) {
    setIsAdmin((data as PrincipalPayload).is_admin === true)
  } else {
    setIsAdmin(false)
  }
}

export function useTailsPrincipal() {
  const uiAuthOff = isUiAuthDisabled()
  const [isAdmin, setIsAdmin] = useState(() =>
    typeof window !== 'undefined' ? uiAuthOff : false,
  )
  /** False until the first principal fetch finishes (or UI auth is disabled). Avoids flashing non-admin UI. */
  const [principalReady, setPrincipalReady] = useState(() =>
    typeof window !== 'undefined' ? uiAuthOff : false,
  )

  const refreshPrincipal = useCallback(async () => {
    const { ok, data } = await fetchPrincipalJson()
    applyPrincipalPayload(ok, data, setIsAdmin)
    setPrincipalReady(true)
  }, [])

  useEffect(() => {
    if (uiAuthOff) {
      setIsAdmin(true)
      setPrincipalReady(true)
      return
    }
    let cancelled = false
    void (async () => {
      const { ok, data } = await fetchPrincipalJson()
      if (!cancelled) {
        applyPrincipalPayload(ok, data, setIsAdmin)
        setPrincipalReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [uiAuthOff])

  useEffect(() => {
    const onAuthChanged = () => {
      void refreshPrincipal()
    }
    window.addEventListener(TAILS_AUTH_CHANGED_EVENT, onAuthChanged)
    return () => {
      window.removeEventListener(TAILS_AUTH_CHANGED_EVENT, onAuthChanged)
    }
  }, [refreshPrincipal])

  return { isAdmin, principalReady, refreshPrincipal }
}
