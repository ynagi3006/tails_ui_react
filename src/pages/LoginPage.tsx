import { useMemo, useState, type ReactNode } from 'react'
import { LogInIcon } from 'lucide-react'
import { Link, Navigate, useLocation } from 'react-router-dom'

import { useOktaAuth } from '@/auth/okta-auth-context'
import { isUiAuthDisabled, isWebOktaAuth } from '@/config/env'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function LoginShell({ children }: { children: ReactNode }) {
  return (
    <div className="from-background via-muted/25 to-background text-foreground relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-linear-to-br p-6 sm:p-10">
      <div
        className="from-primary/15 via-primary/5 pointer-events-none absolute inset-0 bg-radial-[ellipse_100%_70%_at_50%_-25%] to-transparent dark:from-primary/10"
        aria-hidden
      />
      <div className="relative z-[1] w-full max-w-md">{children}</div>
    </div>
  )
}

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
      <LoginShell>
        <Card className="border-border/60 bg-card/90 shadow-xl ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10">
          <CardHeader className="space-y-5 pb-2 text-center sm:px-8 sm:pt-10">
            <div className="bg-primary/8 ring-primary/10 mx-auto flex size-16 items-center justify-center rounded-2xl ring-1 shadow-inner">
              <img
                src="/tails-logo.png"
                alt=""
                width={120}
                height={36}
                className="h-9 w-auto max-w-[9.5rem] object-contain opacity-95 sm:h-10 sm:max-w-[10.5rem]"
              />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold tracking-tight">Sign in unavailable</CardTitle>
              <CardDescription className="text-muted-foreground text-sm leading-relaxed">
                {isWebOktaAuth() ? (
                  <>
                    Web Okta needs <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.7rem]">VITE_TAILS_API_URL</code>{' '}
                    (API origin). Set{' '}
                    <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.7rem]">VITE_TAILS_USE_WEB_OKTA=1</code> and
                    configure the API with the Web client and server redirect URI.
                  </>
                ) : (
                  <>
                    Okta is not configured for this build. Set{' '}
                    <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.7rem]">VITE_OKTA_ISSUER</code> and{' '}
                    <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.7rem]">VITE_OKTA_CLIENT_ID</code> in{' '}
                    <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.7rem]">.env</code>.
                  </>
                )}
              </CardDescription>
            </div>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2 pb-8 sm:px-8">
            <Button variant="outline" className="h-11 w-full rounded-xl" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </CardFooter>
        </Card>
      </LoginShell>
    )
  }

  if (!okta.authReady) {
    return (
      <LoginShell>
        <Card className="border-border/60 bg-card/90 shadow-xl ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10">
          <CardContent className="flex flex-col items-center gap-4 py-14 sm:py-16">
            <div
              className="border-primary/30 border-t-primary size-10 animate-spin rounded-full border-2"
              aria-hidden
            />
            <p className="text-muted-foreground text-sm font-medium">Checking your session…</p>
          </CardContent>
        </Card>
      </LoginShell>
    )
  }

  if (okta.authenticated) {
    return <Navigate to={postLoginPath} replace />
  }

  return (
    <LoginShell>
      <Card className="border-border/60 bg-card/90 overflow-hidden shadow-xl ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10">
        <CardHeader className="space-y-6 pb-2 text-center sm:px-10 sm:pt-12">
          <div className="bg-primary/8 ring-primary/10 mx-auto flex size-[4.5rem] items-center justify-center rounded-2xl ring-1 shadow-inner sm:size-20">
            <img
              src="/tails-logo.png"
              alt=""
              width={140}
              height={42}
              className={cn('h-10 w-auto max-w-[10rem] object-contain opacity-[0.98] sm:h-11 sm:max-w-[11rem]')}
            />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight sm:text-[1.65rem]">Welcome back</CardTitle>
            <CardDescription className="text-muted-foreground mx-auto max-w-[22rem] text-sm leading-relaxed">
              Sign in with your Okta account to use metrics, reports, and catalog tools.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-6 pb-10 sm:px-10">
          <Button
            className="h-12 w-full rounded-xl text-base shadow-md transition-shadow hover:shadow-lg"
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
            <LogInIcon className="mr-2 size-5 opacity-90" aria-hidden />
            Sign in with Okta
          </Button>
          {signInError ? (
            <div
              className="border-destructive/25 bg-destructive/5 text-destructive rounded-xl border px-3 py-2.5 text-center text-xs leading-relaxed"
              role="alert"
            >
              {signInError}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </LoginShell>
  )
}