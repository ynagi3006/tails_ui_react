import { createContext, useContext } from 'react'
import type OktaAuth from '@okta/okta-auth-js'

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

/** Default context value and fallback when auth UI is disabled or Okta is not configured. */
export const OKTA_AUTH_CONTEXT_DEFAULT: OktaAuthContextValue = {
  configured: false,
  authReady: false,
  oktaBootstrapped: false,
  oktaAuth: null,
  authenticated: false,
  userLabel: '',
  signIn: async () => {},
  signOut: async () => {},
}

export const OktaAuthContext = createContext<OktaAuthContextValue>(OKTA_AUTH_CONTEXT_DEFAULT)

export function useOktaAuth(): OktaAuthContextValue {
  return useContext(OktaAuthContext)
}
