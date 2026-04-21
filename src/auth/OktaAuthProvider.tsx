import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import OktaAuth from '@okta/okta-auth-js'

import { getOktaRedirectUri, getOktaScopesList, isOktaBrowserConfigured, isUiAuthDisabled } from '@/config/env'
import { emitAuthChanged, registerOktaAccessTokenGetter } from '@/lib/api-auth-headers'

export type OktaAuthContextValue = {
  configured: boolean
  /** True after the first ``isAuthenticated`` check finishes (avoids flashing /login for returning users). */
  authReady: boolean
  /** Shared SDK client when ``configured``; login return is handled in this provider (any registered redirect URI). */
  oktaAuth: OktaAuth | null
  authenticated: boolean
  userLabel: string
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const defaultValue: OktaAuthContextValue = {
  configured: false,
  authReady: false,
  oktaAuth: null,
  authenticated: false,
  userLabel: '',
  signIn: async () => {},
  signOut: async () => {},
}

const OktaAuthContext = createContext<OktaAuthContextValue>(defaultValue)

export function useOktaAuth(): OktaAuthContextValue {
  return useContext(OktaAuthContext)
}

type Props = { children: ReactNode }

export function OktaAuthProvider({ children }: Props) {
  const issuer = (import.meta.env.VITE_OKTA_ISSUER || '').trim()
  const clientId = (import.meta.env.VITE_OKTA_CLIENT_ID || '').trim()
  const postLogout = (import.meta.env.VITE_OKTA_POST_LOGOUT_REDIRECT_URI || '').trim()
  /** Bust OktaAuth instance when redirect env changes (dev). */
  const redirectEnvKey = (import.meta.env.VITE_OKTA_REDIRECT_URI || '').trim()

  const oktaAuth = useMemo(() => {
    if (typeof window === 'undefined') return null
    if (isUiAuthDisabled()) return null
    if (!issuer || !clientId) return null
    const redirectUri = getOktaRedirectUri()
    if (!redirectUri) return null
    return new OktaAuth({
      issuer,
      clientId,
      redirectUri,
      pkce: true,
      scopes: getOktaScopesList(),
      tokenManager: {
        autoRenew: true,
        storage: 'localStorage',
      },
    })
  }, [issuer, clientId, redirectEnvKey, import.meta.env.VITE_TAILS_AUTH_DISABLED])

  const [authenticated, setAuthenticated] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [userLabel, setUserLabel] = useState('')

  const refreshUserLabel = useCallback(async (client: OktaAuth | null, isAuthed: boolean) => {
    if (!client || !isAuthed) {
      setUserLabel('')
      return
    }
    try {
      const u = await client.getUser()
      const email = typeof u.email === 'string' ? u.email.trim() : ''
      const pref = typeof u.preferred_username === 'string' ? u.preferred_username.trim() : ''
      const name = typeof u.name === 'string' ? u.name.trim() : ''
      setUserLabel(email || pref || name || '')
    } catch {
      setUserLabel('')
    }
  }, [])

  useEffect(() => {
    registerOktaAccessTokenGetter(null)
    if (!oktaAuth) {
      setAuthReady(false)
      return
    }

    setAuthReady(false)
    registerOktaAccessTokenGetter(() => oktaAuth.getAccessToken())

    let cancelled = false
    const syncAuth = () => {
      void oktaAuth.isAuthenticated({ onExpiredToken: 'renew' }).then((v) => {
        if (cancelled) return
        setAuthenticated(v)
        setAuthReady(true)
        void refreshUserLabel(oktaAuth, v)
        emitAuthChanged()
      })
    }

    syncAuth()

    const onTm = () => syncAuth()
    oktaAuth.tokenManager.on('added', onTm)
    oktaAuth.tokenManager.on('renewed', onTm)
    oktaAuth.tokenManager.on('removed', onTm)

    return () => {
      cancelled = true
      oktaAuth.tokenManager.off('added', onTm)
      oktaAuth.tokenManager.off('renewed', onTm)
      oktaAuth.tokenManager.off('removed', onTm)
      registerOktaAccessTokenGetter(null)
    }
  }, [oktaAuth, refreshUserLabel])

  const signIn = useCallback(async () => {
    if (!oktaAuth) return
    await oktaAuth.signInWithRedirect()
  }, [oktaAuth])

  const signOut = useCallback(async () => {
    if (!oktaAuth) return
    const post = postLogout || (typeof window !== 'undefined' ? window.location.origin : undefined)
    await oktaAuth.signOut({ postLogoutRedirectUri: post })
    setAuthenticated(false)
    setUserLabel('')
    emitAuthChanged()
  }, [oktaAuth, postLogout])

  const value = useMemo<OktaAuthContextValue>(() => {
    if (!oktaAuth || !isOktaBrowserConfigured()) {
      return defaultValue
    }
    return {
      configured: true,
      authReady,
      oktaAuth,
      authenticated,
      userLabel,
      signIn,
      signOut,
    }
  }, [oktaAuth, authReady, authenticated, userLabel, signIn, signOut])

  return <OktaAuthContext.Provider value={value}>{children}</OktaAuthContext.Provider>
}
