import { useMemo, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'

import { useOktaAuth } from '@/auth/OktaAuthProvider'
import { getApiBaseUrl, getOktaRedirectUri, isUiAuthDisabled, isWebOktaAuth } from '@/config/env'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function safePostLoginPath(state: unknown): string {
  const from = state && typeof state === 'object' && 'from' in state ? (state as { from: unknown }).from : undefined

  if (typeof from === 'string') {
    if (!from.startsWith('/') || from.startsWith('//')) return '/'
    if (from === '/login' || from.startsWith('/login/')) return '/'
    return from
  }

  if (from && typeof from === 'object') {
    const loc = from as { pathname?: unknown; search?: unknown; hash?: unknown }
    const pathname = typeof loc.pathname === 'string' ? loc.pathname : '/'
    const search = typeof loc.search === 'string' ? loc.search : ''
    const hash = typeof loc.hash === 'string' ? loc.hash : ''

    if (!pathname.startsWith('/') || pathname.startsWith('//')) return '/'
    if (pathname === '/login' || pathname.startsWith('/login/')) return '/'

    return `${pathname}${search}${hash}` || '/'
  }

  return '/'
}

export function LoginPage() {
  const location = useLocation()
  const okta = useOktaAuth()
  const [signInError, setSignInError] = useState<string | null>(null)

  const postLoginPath = useMemo(() => safePostLoginPath(location.state), [location.state])

  if (isUiAuthDisabled()) {
    return <Navigate to="/" replace />
  }

  if (!okta.configured) {
    return (
      <div className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center p-6">
        <Card className="w-full max-w-md rounded-2xl border-border/80 shadow-lg">
          <CardHeader className="text-center">
            <img
              src="/tails-logo.png"
              alt=""
              width={168}
              height={48}
              className={cn(
                'mx-auto h-12 w-auto max-w-[12rem] object-contain sm:h-14 sm:max-w-[14rem]',
                'rounded-md px-1 py-1',
              )}
            />
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>
              {isWebOktaAuth() ? (
                <>
                  Web Okta needs <code className="text-xs">VITE_TAILS_API_URL</code> (API origin). Set{' '}
                  <code className="text-xs">VITE_TAILS_USE_WEB_OKTA=1</code> and ensure the API has the Web client secret
                  and <code className="text-xs">TAILS_OKTA_SERVER_REDIRECT_URI</code>.
                </>
              ) : (
                <>
                  Okta is not configured for this build. Set <code className="text-xs">VITE_OKTA_ISSUER</code> and{' '}
                  <code className="text-xs">VITE_OKTA_CLIENT_ID</code> in <code className="text-xs">.env</code>.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  if (!okta.authReady) {
    return (
      <div className="bg-background text-muted-foreground flex min-h-svh items-center justify-center text-sm">
        Checking session…
      </div>
    )
  }

  if (okta.authenticated) {
    return <Navigate to={postLoginPath} replace />
  }

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center p-6">
      <Card className="w-full max-w-md rounded-2xl border-border/80 shadow-lg">
        <CardHeader className="text-center">
          <img
            src="/tails-logo.png"
            alt=""
            width={168}
            height={48}
            className={cn(
              'mx-auto h-12 w-auto max-w-[12rem] object-contain sm:h-14 sm:max-w-[14rem]',
              'rounded-md px-1 py-1',
            )}
          />
          <CardTitle className="text-xl">Sign in to Tails</CardTitle>
          <CardDescription>Use your Okta account to access metrics, reports, and internal tools.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            className="w-full rounded-xl"
            type="button"
            size="lg"
            onClick={() => {
              setSignInError(null)
              void okta.signIn(postLoginPath).catch((e: unknown) => {
                console.error('[tails] Okta sign-in failed', e)
                setSignInError(e instanceof Error ? e.message : String(e))
              })
            }}
          >
            Sign in with Okta
          </Button>
          {signInError ? (
            <p className="text-destructive text-center text-xs leading-relaxed" role="alert">
              {signInError}
            </p>
          ) : null}
          <p className="text-muted-foreground text-center text-xs leading-relaxed">
            {isWebOktaAuth() ? (
              <>
                In Okta, add this <strong>Sign-in redirect URI</strong> for your <strong>Web</strong> application:{' '}
                <span className="text-foreground font-mono break-all">
                  {(getApiBaseUrl() || '(set VITE_TAILS_API_URL)').replace(/\/$/, '')}/auth/okta/callback
                </span>
              </>
            ) : (
              <>
                Redirect URI registered in Okta must include:{' '}
                <span className="text-foreground font-mono break-all">{getOktaRedirectUri()}</span>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}