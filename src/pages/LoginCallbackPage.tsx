import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useOktaAuth } from '@/auth/OktaAuthProvider'
import { isOktaBrowserConfigured, isUiAuthDisabled } from '@/config/env'
import { emitAuthChanged } from '@/lib/api-auth-headers'

export function LoginCallbackPage() {
  const navigate = useNavigate()
  const { configured, oktaAuth } = useOktaAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isUiAuthDisabled() || !isOktaBrowserConfigured() || !oktaAuth) {
      navigate('/', { replace: true })
      return
    }
    if (!oktaAuth.isLoginRedirect()) {
      navigate('/', { replace: true })
      return
    }
    let cancelled = false
    void oktaAuth
      .handleLoginRedirect()
      .then(() => {
        if (cancelled) return
        emitAuthChanged()
        navigate('/', { replace: true })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [navigate, oktaAuth])

  if (error) {
    return (
      <div className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-destructive max-w-md text-sm">Sign-in could not be completed: {error}</p>
        <Link to="/" className="text-primary text-sm underline underline-offset-4">
          Back to home
        </Link>
      </div>
    )
  }

  return (
    <div className="text-muted-foreground flex min-h-svh flex-col items-center justify-center gap-2 text-sm">
      <p>Completing sign-in…</p>
      {!configured ? (
        <p className="text-destructive max-w-sm text-xs">Okta is not configured in this build (missing env).</p>
      ) : null}
    </div>
  )
}
