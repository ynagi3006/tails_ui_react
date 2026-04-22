import { Link, NavLink, Outlet } from 'react-router-dom'
import { ChevronDownIcon } from 'lucide-react'

import { useOktaAuth } from '@/auth/OktaAuthProvider'
import { AgentChatWidget } from '@/components/agent-chat-widget'
import { FeatureRequestFooterTrigger } from '@/components/feature-request-dialog'
import { ThemeMenu } from '@/components/theme-menu'
import { getApiBaseUrl, getOktaRedirectUri } from '@/config/env'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTailsPrincipal } from '@/hooks/use-tails-principal'
import { cn } from '@/lib/utils'

const mainNav: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/metrics', label: 'Metrics' },
  { to: '/reports', label: 'Reports' },
  { to: '/explore', label: 'Explore' },
  { to: '/report-builder', label: 'Builder' },
]

function navPillClass({ isActive }: { isActive: boolean }) {
  return cn(
    'rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
    isActive
      ? 'bg-background text-foreground shadow-sm'
      : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
  )
}

export function AppShell() {
  const api = getApiBaseUrl()
  const { isAdmin } = useTailsPrincipal()
  const okta = useOktaAuth()

  return (
    <TooltipProvider>
    <div className="flex min-h-svh flex-col">
      <header className="bg-background/80 supports-backdrop-filter:bg-background/70 sticky top-0 z-50 border-b border-border/60 backdrop-blur-xl">
        <div className="mx-auto grid h-14 max-w-[min(100%,112rem)] grid-cols-[auto_1fr_auto] items-center gap-2 px-4 sm:gap-4 sm:px-6">
          <Link
            to="/"
            aria-label="Tails home"
            className="text-foreground flex shrink-0 items-center gap-2.5 font-semibold tracking-tight"
          >
            <img
              src="/tails-logo.png"
              alt=""
              width={140}
              height={40}
              decoding="async"
              className={cn(
                'h-10 w-auto max-w-[9rem] object-contain sm:max-w-[11rem]',
                /* Transparent PNG: same flush treatment in light and dark */
                'rounded-md px-0.5 py-0.5',
              )}
            />
            <span className="hidden sm:inline">Tails</span>
          </Link>

          <nav
            className="border-border/60 bg-muted/40 flex min-w-0 justify-self-center overflow-x-auto rounded-full border p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Main"
          >
            <div className="flex items-center gap-0.5">
              {mainNav.map(({ to, label, end }) => (
                <NavLink key={to} to={to} end={end} className={navPillClass}>
                  {label}
                </NavLink>
              ))}
            </div>
          </nav>

          <div className="border-border/60 flex shrink-0 items-center justify-end gap-0.5 border-l pl-2 sm:gap-1 sm:pl-3">
            {okta.configured ? (
              okta.authenticated ? (
                <>
                  {okta.userLabel ? (
                    <span
                      className="text-muted-foreground hidden max-w-[10rem] truncate text-xs sm:inline"
                      title={okta.userLabel}
                    >
                      {okta.userLabel}
                    </span>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full border-border/70 px-2.5 text-xs"
                    type="button"
                    onClick={() => void okta.signOut()}
                  >
                    Sign out
                  </Button>
                </>
              ) : (
                <Button variant="default" size="sm" className="h-8 rounded-full px-2.5 text-xs" asChild>
                  <Link
                    to="/login"
                    title={`Add this exact URL under Okta → Applications → your SPA → Sign-in redirect URIs: ${getOktaRedirectUri()}`}
                  >
                    Sign in
                  </Link>
                </Button>
              )
            ) : null}
            <ThemeMenu />
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex" asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-0.5 px-2.5 text-muted-foreground" type="button">
                  Docs
                  <ChevronDownIcon className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl">
                {api ? (
                  <>
                    <DropdownMenuItem asChild>
                      <a href={`${api}/docs`} target="_blank" rel="noreferrer">
                        API docs
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={`${api}/redoc`} target="_blank" rel="noreferrer">
                        ReDoc
                      </a>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem disabled>Set VITE_TAILS_API_URL for API links</DropdownMenuItem>
                )}
                {isAdmin ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/admin">Admin</Link>
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[min(100%,112rem)] flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
      <footer className="border-border/60 text-muted-foreground border-t py-6 text-sm">
        <div className="mx-auto flex max-w-[min(100%,112rem)] flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6">
          <p className="text-center sm:text-left">© {new Date().getFullYear()} Tails Internal Tools</p>
          <FeatureRequestFooterTrigger />
        </div>
      </footer>
      <AgentChatWidget />
    </div>
    </TooltipProvider>
  )
}
