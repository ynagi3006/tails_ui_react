import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useOktaAuth } from '@/auth/OktaAuthProvider'
import { isUiAuthDisabled } from '@/config/env'

/**
 * When Okta is configured, only authenticated users may reach nested routes (app shell).
 * Without Okta env, all routes stay available for local development.
 * Set ``VITE_TAILS_AUTH_DISABLED=true`` to bypass guards while keeping other env vars.
 */
export function RequireAuth() {
  const okta = useOktaAuth()
  const location = useLocation()

  if (isUiAuthDisabled() || !okta.configured) {
    return <Outlet />
  }

  if (!okta.authReady) {
    return (
      <div className="bg-background text-muted-foreground flex min-h-svh items-center justify-center text-sm">
        Checking session…
      </div>
    )
  }

  if (!okta.authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
