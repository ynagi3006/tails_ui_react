import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import OktaAuth from '@okta/okta-auth-js'

import {
  getApiBaseUrl,
  getOktaRedirectUri,
  getOktaScopesList,
  isOktaBrowserConfigured,
  isUiAuthDisabled,
  isWebOktaAuth,
  warnOktaIssuerShapeInDev,
} from '@/config/env'
import {
  emitAuthChanged,
  registerOktaAccessTokenGetter,
  TAILS_AUTH_CHANGED_EVENT,
} from '@/lib/api-auth-headers'

export type OktaAuthContextValue = {
  configured: boolean
  /** True after the first ``isAuthenticated`` / session check finishes (avoids flashing /login for returning users). */
  authReady: boolean
  /**
   * True after ``oktaAuth.start()`` completes (SPA), or after the first Web session probe.
   * Redirect handling for PKCE must run only after the client service has started.
   */
  oktaBootstrapped: boolean
  /** Shared SDK client when SPA PKCE mode; null for Web (confidential) OAuth. */
  oktaAuth: OktaAuth | null
  authenticated: boolean
  userLabel: string
  /** Optional path (e.g. from RequireAuth) preserved for redirect after sign-in. */
  signIn: (returnTo?: string) => Promise<void>
  signOut: () => Promise<void>
}

const defaultValue: OktaAuthContextValue = {
  configured: false,
  authReady: false,
  oktaBootstrapped: false,
  oktaAuth: null,
  authenticated: false,
  userLabel: '',
  signIn: async () => {},
  signOut: async () => {},
}

const OktaAuthContext = createContext<OktaAuthContextValue>(defaultValue)

/** Serialize PKCE redirect handling across React StrictMode double effects / concurrent mounts. */
let inflightLoginRedirect: Promise<void> | null = null

export function useOktaAuth(): OktaAuthContextValue {
  return useContext(OktaAuthContext)
}

type Props = { children: ReactNode }

export function OktaAuthProvider({ children }: Props) {
  const webOkta = isWebOktaAuth()
  const issuer = (import.meta.env.VITE_OKTA_ISSUER || '').trim()
  const clientId = (import.meta.env.VITE_OKTA_CLIENT_ID || '').trim()
  const postLogout = (import.meta.env.VITE_OKTA_POST_LOGOUT_REDIRECT_URI || '').trim()
  /** Bust OktaAuth instance when redirect env changes (dev). */
  const redirectEnvKey = (import.meta.env.VITE_OKTA_REDIRECT_URI || '').trim()
  const authDisabledFlag = Boolean(import.meta.env.VITE_TAILS_AUTH_DISABLED)

  const oktaAuth = useMemo(() => {
    if (typeof window === 'undefined') return null
    if (isUiAuthDisabled() || webOkta) return null
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
  }, [issuer, clientId, redirectEnvKey, authDisabledFlag, webOkta])

  const [authenticated, setAuthenticated] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [oktaBootstrapped, setOktaBootstrapped] = useState(false)
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

  /** Web (confidential) OAuth: session cookie + ``GET /auth/okta/session``. */
  useEffect(() => {
    if (!webOkta) return
    registerOktaAccessTokenGetter(null)
    setAuthReady(false)
    setOktaBootstrapped(false)
    let cancelled = false

    const probeSession = async (emit: boolean) => {
      const base = getApiBaseUrl()
      if (!base) {
        if (!cancelled) {
          setAuthenticated(false)
          setUserLabel('')
          setAuthReady(true)
          setOktaBootstrapped(true)
        }
        return
      }
      try {
        const r = await fetch(`${base}/auth/okta/session`, { credentials: 'include' })
        if (cancelled) return
        if (r.ok) {
          const j = (await r.json()) as { authenticated?: boolean; user_label?: string; email?: string }
          const authed = Boolean(j?.authenticated)
          setAuthenticated(authed)
          const lab = (typeof j?.user_label === 'string' ? j.user_label : '').trim()
          const em = (typeof j?.email === 'string' ? j.email : '').trim()
          setUserLabel(lab || em || '')
        } else {
          setAuthenticated(false)
          setUserLabel('')
        }
      } catch (e) {
        console.error('[tails] Web Okta session check failed', e)
        if (!cancelled) {
          setAuthenticated(false)
          setUserLabel('')
        }
      }
      if (!cancelled) {
        setAuthReady(true)
        setOktaBootstrapped(true)
        if (emit) emitAuthChanged()
      }
    }

    void probeSession(true)

    const onAuthChanged = () => {
      void probeSession(false)
    }
    window.addEventListener(TAILS_AUTH_CHANGED_EVENT, onAuthChanged)
    return () => {
      cancelled = true
      window.removeEventListener(TAILS_AUTH_CHANGED_EVENT, onAuthChanged)
    }
  }, [webOkta])

  useEffect(() => {
    if (webOkta) return
    registerOktaAccessTokenGetter(null)
    if (!oktaAuth) {
      setAuthReady(false)
      setOktaBootstrapped(false)
      return
    }

    setAuthReady(false)
    setOktaBootstrapped(false)
    warnOktaIssuerShapeInDev()
    registerOktaAccessTokenGetter(async () => {
      const t = await oktaAuth.getOrRenewAccessToken()
      return t ?? undefined
    })

    let cancelled = false

    const applyAuthState = (authState: { isAuthenticated?: boolean }) => {
      if (cancelled) return
      const v = Boolean(authState.isAuthenticated)
      setAuthenticated(v)
      setAuthReady(true)
      void refreshUserLabel(oktaAuth, v)
      emitAuthChanged()
    }

    oktaAuth.authStateManager.subscribe(applyAuthState)

    void (async () => {
      try {
        await oktaAuth.start()
      } catch (e) {
        console.error('[tails] OktaAuth.start() failed', e)
      }
      if (oktaAuth.isLoginRedirect()) {
        if (!inflightLoginRedirect) {
          inflightLoginRedirect = oktaAuth
            .handleLoginRedirect()
            .catch((e: unknown) => {
              console.error('[tails] Okta handleLoginRedirect failed', e)
              const msg = e instanceof Error ? e.message : String(e)
              if (/unable to parse a token from the url/i.test(msg)) {
                console.error(
                  '[tails] OAuth query was already consumed or missing ?code=. Redirect URI in use:',
                  getOktaRedirectUri(),
                )
              }
              if (/client authentication failed/i.test(msg)) {
                console.error(
                  '[tails] Token step failed for PKCE. If your Okta app is **Web** (confidential), use ' +
                    '`VITE_TAILS_USE_WEB_OKTA=1` and server `/auth/okta/*` instead of PKCE in the browser.',
                )
                console.info('[tails] Debug: issuer=', issuer, 'redirectUri=', getOktaRedirectUri(), 'clientId len=', clientId.length)
              }
              throw e
            })
            .finally(() => {
              inflightLoginRedirect = null
            })
        }
        try {
          await inflightLoginRedirect
        } catch {
          /* rejected promise already logged once in shared .catch() above */
        }
      } else if (
        typeof window !== 'undefined' &&
        /[?&]code=/.test(window.location.search || '') &&
        import.meta.env.DEV
      ) {
        console.warn(
          '[tails] URL contains ?code= but OktaAuth does not treat this as a login redirect. ' +
            'Check VITE_OKTA_REDIRECT_URI matches the exact redirect URI in Okta (scheme, host, port, path, trailing slash). ' +
            `Configured redirectUri is: ${getOktaRedirectUri()}`,
        )
      }
      if (cancelled) return
      setOktaBootstrapped(true)
      try {
        await oktaAuth.authStateManager.updateAuthState()
      } catch (e) {
        console.error('[tails] Okta auth state update failed', e)
      }
      if (cancelled) return
      const state = oktaAuth.authStateManager.getAuthState()
      if (state != null) {
        applyAuthState(state)
      } else {
        const v = await oktaAuth.isAuthenticated({ onExpiredToken: 'renew' })
        if (!cancelled) {
          setAuthenticated(v)
          setAuthReady(true)
          void refreshUserLabel(oktaAuth, v)
          emitAuthChanged()
        }
      }
    })()

    return () => {
      cancelled = true
      oktaAuth.authStateManager.unsubscribe(applyAuthState)
      void oktaAuth.stop().catch(() => {})
      registerOktaAccessTokenGetter(null)
    }
  }, [oktaAuth, refreshUserLabel, webOkta])

  const signIn = useCallback(
    async (returnTo?: string) => {
      if (webOkta) {
        const base = getApiBaseUrl()
        if (!base || typeof window === 'undefined') return
        let path = '/'
        if (typeof returnTo === 'string' && returnTo.trim()) {
          const p = returnTo.trim()
          if (p.startsWith('/') && !p.startsWith('//')) {
            path = p
          }
        }
        const returnToUrl = new URL(path, window.location.origin).href
        window.location.assign(`${base}/auth/okta/login?return_to=${encodeURIComponent(returnToUrl)}`)
        return
      }
      if (!oktaAuth || typeof window === 'undefined') return
      oktaAuth.removeOriginalUri()
      let originalUri = `${window.location.origin}/`
      if (typeof returnTo === 'string' && returnTo.trim()) {
        const p = returnTo.trim()
        if (p.startsWith('/') && !p.startsWith('//')) {
          try {
            originalUri = new URL(p, window.location.origin).href
          } catch {
            /* keep default */
          }
        }
      }
      if (originalUri.includes('/login')) {
        originalUri = `${window.location.origin}/`
      }
      await oktaAuth.signInWithRedirect({ originalUri })
    },
    [oktaAuth, webOkta],
  )

  const signOut = useCallback(async () => {
    if (webOkta) {
      const base = getApiBaseUrl()
      if (!base || typeof window === 'undefined') return
      const post =
        postLogout.trim() ||
        (typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login')
      window.location.assign(`${base}/auth/okta/logout?post_logout_redirect_uri=${encodeURIComponent(post)}`)
      setAuthenticated(false)
      setUserLabel('')
      emitAuthChanged()
      return
    }
    if (!oktaAuth) return
    const post = postLogout || (typeof window !== 'undefined' ? window.location.origin : undefined)
    await oktaAuth.signOut({ postLogoutRedirectUri: post })
    setAuthenticated(false)
    setUserLabel('')
    emitAuthChanged()
  }, [oktaAuth, postLogout, webOkta])

  const value = useMemo<OktaAuthContextValue>(() => {
    if (isUiAuthDisabled()) {
      return defaultValue
    }
    if (webOkta) {
      if (!getApiBaseUrl()) {
        return defaultValue
      }
      return {
        configured: true,
        authReady,
        oktaBootstrapped,
        oktaAuth: null,
        authenticated,
        userLabel,
        signIn,
        signOut,
      }
    }
    if (!oktaAuth || !isOktaBrowserConfigured()) {
      return defaultValue
    }
    return {
      configured: true,
      authReady,
      oktaBootstrapped,
      oktaAuth,
      authenticated,
      userLabel,
      signIn,
      signOut,
    }
  }, [
    webOkta,
    oktaAuth,
    authReady,
    oktaBootstrapped,
    authenticated,
    userLabel,
    signIn,
    signOut,
  ])

  return <OktaAuthContext.Provider value={value}>{children}</OktaAuthContext.Provider>
}
