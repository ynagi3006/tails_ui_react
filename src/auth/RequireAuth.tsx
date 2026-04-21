import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useOktaAuth } from '@/auth/OktaAuthProvider'
import { isUiAuthDisabled } from '@/config/env'

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
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}