import { useEffect } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { useOktaAuth } from '@/auth/OktaAuthProvider'
import { getOktaRedirectUri, isOktaBrowserConfigured, isUiAuthDisabled } from '@/config/env'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function LoginPage() {
  const navigate = useNavigate()
  const okta = useOktaAuth()

  useEffect(() => {
    if (okta.configured && okta.authReady && okta.authenticated) {
      navigate('/', { replace: true })
    }
  }, [okta.authReady, okta.authenticated, okta.configured, navigate])

  if (isUiAuthDisabled()) {
    return <Navigate to="/" replace />
  }

  if (!isOktaBrowserConfigured() || !okta.configured) {
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
              Okta is not configured for this build. Set <code className="text-xs">VITE_OKTA_ISSUER</code> and{' '}
              <code className="text-xs">VITE_OKTA_CLIENT_ID</code> in <code className="text-xs">.env</code>.
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
          <Button className="w-full rounded-xl" type="button" size="lg" onClick={() => void okta.signIn()}>
            Sign in with Okta
          </Button>
          <p className="text-muted-foreground text-center text-xs leading-relaxed">
            Redirect URI registered in Okta must include:{' '}
            <span className="text-foreground font-mono break-all">{getOktaRedirectUri()}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
