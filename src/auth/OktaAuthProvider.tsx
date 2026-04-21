import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import OktaAuth from '@okta/okta-auth-js'

import {
  getOktaRedirectUri,
  getOktaScopesList,
  isOktaBrowserConfigured,
  isUiAuthDisabled,
  warnOktaIssuerShapeInDev,
} from '@/config/env'
import { emitAuthChanged, registerOktaAccessTokenGetter } from '@/lib/api-auth-headers'

export type OktaAuthContextValue = {
  configured: boolean
  /** True after the first ``isAuthenticated`` check finishes (avoids flashing /login for returning users). */
  authReady: boolean
  /**
   * True after ``oktaAuth.start()`` completes. Per Okta, redirect handling must run only after the
   * client service (token manager, renew, storage sync) has started.
   */
  oktaBootstrapped: boolean
  /** Shared SDK client when ``configured``; login return is handled in this provider (any registered redirect URI). */
  oktaAuth: OktaAuth | null
  authenticated: boolean
  userLabel: string
  /** Optional path (e.g. from RequireAuth) used as Okta ``originalUri`` after sign-in. */
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
  const issuer = (import.meta.env.VITE_OKTA_ISSUER || '').trim()
  const clientId = (import.meta.env.VITE_OKTA_CLIENT_ID || '').trim()
  const postLogout = (import.meta.env.VITE_OKTA_POST_LOGOUT_REDIRECT_URI || '').trim()
  /** Bust OktaAuth instance when redirect env changes (dev). */
  const redirectEnvKey = (import.meta.env.VITE_OKTA_REDIRECT_URI || '').trim()
  const authDisabledFlag = Boolean(import.meta.env.VITE_TAILS_AUTH_DISABLED)

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
  }, [issuer, clientId, redirectEnvKey, authDisabledFlag])

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

  useEffect(() => {
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
      // Exchange ?code=… for tokens on whatever URL is registered in Okta (e.g. `/` or `/login/callback`).
      // Do not skip this when `cancelled` (React StrictMode): the first effect teardown would otherwise
      // leave the auth code unprocessed and the user stuck on /login with no session.
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
                  '[tails] Token step failed (Okta often maps invalid_client / policy issues to this message). ' +
                    'Verify: (1) Application type is **Single Page Application** — not "Web" (Web expects client_secret at /token; SPA uses PKCE only). ' +
                    '(2) VITE_OKTA_CLIENT_ID is the **Client ID** of that SPA (General tab). ' +
                    '(3) VITE_OKTA_ISSUER is the **same authorization server** the app is assigned to (include `/oauth2/default` or `/oauth2/aus…`). ' +
                    '(4) VITE_OKTA_REDIRECT_URI matches a Sign-in redirect URI **exactly** (e.g. http://localhost:5173/).',
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
  }, [oktaAuth, refreshUserLabel])

  const signIn = useCallback(async (returnTo?: string) => {
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
      oktaBootstrapped,
      oktaAuth,
      authenticated,
      userLabel,
      signIn,
      signOut,
    }
  }, [oktaAuth, authReady, oktaBootstrapped, authenticated, userLabel, signIn, signOut])

  return <OktaAuthContext.Provider value={value}>{children}</OktaAuthContext.Provider>
}
