import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useOktaAuth } from '@/auth/okta-auth-context'
import { isOktaBrowserConfigured, isUiAuthDisabled, isWebOktaAuth } from '@/config/env'

function replaceDocumentToAppHome() {
  window.location.replace(new URL('/', window.location.origin).href)
}

/**
 * UX route only: ``OktaAuthProvider`` already runs ``handleLoginRedirect`` for any registered redirect URI
 * (including ``/``). Calling it again here caused a second parse on an already-stripped URL →
 * "Unable to parse a token from the url" and sometimes duplicate code exchange → Okta errors.
 */
export function LoginCallbackPage() {
  const navigate = useNavigate()
  const { configured, oktaAuth, oktaBootstrapped } = useOktaAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isUiAuthDisabled()) {
      navigate('/', { replace: true })
      return
    }
    if (isWebOktaAuth()) {
      navigate('/', { replace: true })
      return
    }
    if (!isOktaBrowserConfigured() || !oktaAuth) {
      navigate('/', { replace: true })
      return
    }
    if (!oktaBootstrapped) {
      return
    }
    let cancelled = false
    void (async () => {
      const ok = await oktaAuth.isAuthenticated({ onExpiredToken: 'renew' })
      if (cancelled) return
      if (ok) {
        replaceDocumentToAppHome()
        return
      }
      setError('Sign-in did not complete. Try again from the login page.')
    })()
    return () => {
      cancelled = true
    }
  }, [navigate, oktaAuth, oktaBootstrapped])

  if (error) {
    return (
      <div className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-destructive max-w-md text-sm">{error}</p>
        <Link to="/login" className="text-primary text-sm underline underline-offset-4">
          Back to sign in
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
