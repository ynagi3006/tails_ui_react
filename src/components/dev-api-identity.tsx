import { useCallback, useEffect, useState } from 'react'
import { UserCogIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getApiBaseUrl } from '@/config/env'
import {
  clearDevAuthStorage,
  loadDevAuthFromStorage,
  getDevAuthHeaders,
  saveDevAuthToStorage,
} from '@/lib/dev-auth-headers'

type DevApiIdentityProps = {
  /** Called after Save / Clear so nav (e.g. Admin) can re-check principal. */
  onIdentityChange?: () => void
}

async function fetchMe(path: 'principal' | 'profile'): Promise<{ ok: boolean; body: string }> {
  const root = getApiBaseUrl()
  if (!root) {
    return { ok: false, body: 'Set VITE_TAILS_API_URL in .env' }
  }
  const suffix = path === 'principal' ? 'users/me/principal' : 'users/me'
  try {
    const r = await fetch(`${root}/api/v1/${suffix}`, {
      headers: { Accept: 'application/json', ...getDevAuthHeaders() },
    })
    const text = await r.text()
    let formatted = text
    try {
      formatted = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      /* raw */
    }
    if (!r.ok) {
      formatted = `${r.status} ${r.statusText}\n${formatted}`
    }
    return { ok: r.ok, body: formatted }
  } catch (e) {
    return { ok: false, body: String(e instanceof Error ? e.message : e) }
  }
}

export function DevApiIdentityPopover({ onIdentityChange }: DevApiIdentityProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [sub, setSub] = useState('')
  const [token, setToken] = useState('')
  const [principalOut, setPrincipalOut] = useState('')
  const [profileOut, setProfileOut] = useState('')
  const [loading, setLoading] = useState(false)

  const loadForm = useCallback(() => {
    const v = loadDevAuthFromStorage()
    setEmail(v.email)
    setSub(v.sub)
    setToken(v.token)
  }, [])

  useEffect(() => {
    if (open) loadForm()
  }, [open, loadForm])

  const runTest = useCallback(
    async (updatePanels: boolean) => {
      if (updatePanels) {
        setPrincipalOut('Loading…')
        setProfileOut('')
      }
      setLoading(true)
      try {
        const p = await fetchMe('principal')
        if (updatePanels) setPrincipalOut(p.body)
        const u = await fetchMe('profile')
        if (updatePanels) setProfileOut(u.body)
        onIdentityChange?.()
      } finally {
        setLoading(false)
      }
    },
    [onIdentityChange],
  )

  const onSave = () => {
    saveDevAuthToStorage({ email, sub, token })
    void runTest(true)
  }

  const onClear = () => {
    clearDevAuthStorage()
    loadForm()
    void runTest(true)
  }

  const onTestOnly = () => {
    void runTest(true)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex" asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full border-border/70" type="button">
          <UserCogIcon className="size-3.5 opacity-80" />
          Dev identity
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="border-border/80 max-h-[min(90vh,32rem)] w-[min(calc(100vw-1.5rem),22rem)] overflow-y-auto rounded-2xl p-4 shadow-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-4">
          <div>
            <p className="text-foreground text-sm font-semibold">Dev API identity</p>
            <p className="text-muted-foreground mt-1 text-xs">Optional headers for API requests.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tails-dev-email" className="text-xs">
              Tails profile email
            </Label>
            <Input
              id="tails-dev-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com (Dynamo lookup)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tails-dev-sub" className="text-xs">
              User id override (optional)
            </Label>
            <Input
              id="tails-dev-sub"
              type="text"
              autoComplete="off"
              placeholder="Okta sub or Dynamo user_id"
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              className="h-9 rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tails-dev-token" className="text-xs">
              Okta access token (optional)
            </Label>
            <Input
              id="tails-dev-token"
              type="password"
              autoComplete="off"
              placeholder="When API uses okta mode"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="h-9 rounded-lg"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="rounded-lg" disabled={loading} onClick={onSave}>
              Save
            </Button>
            <Button type="button" size="sm" variant="secondary" className="rounded-lg" disabled={loading} onClick={onClear}>
              Clear
            </Button>
            <Button type="button" size="sm" variant="outline" className="rounded-lg" disabled={loading} onClick={onTestOnly}>
              Test
            </Button>
          </div>

          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium">/users/me/principal</p>
            <pre
              className="bg-muted/70 max-h-36 overflow-auto rounded-xl border border-border/50 p-2.5 text-[11px] leading-relaxed break-words whitespace-pre-wrap"
              aria-live="polite"
            >
              {principalOut || '—'}
            </pre>
          </div>
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium">/users/me</p>
            <pre
              className="bg-muted/70 max-h-36 overflow-auto rounded-xl border border-border/50 p-2.5 text-[11px] leading-relaxed break-words whitespace-pre-wrap"
              aria-live="polite"
            >
              {profileOut || '—'}
            </pre>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
