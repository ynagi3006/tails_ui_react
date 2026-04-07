import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getApiBaseUrl } from '@/config/env'
import { apiFetchJson } from '@/lib/api'
import { loadDevAuthFromStorage } from '@/lib/dev-auth-headers'
import { cn } from '@/lib/utils'

type FeatureRequestResponse = {
  issue_key: string
  issue_url: string
}

const selectClass = cn(
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none',
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
  'disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30',
)

export function FeatureRequestFooterTrigger() {
  const hasApi = Boolean(getApiBaseUrl())
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [requestType, setRequestType] = useState<'Feature' | 'Bug'>('Feature')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [capitalizable, setCapitalizable] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<FeatureRequestResponse | null>(null)

  useEffect(() => {
    if (!open) return
    setSuccess(null)
    setError(null)
    setSubmitting(false)
    setTitle('')
    setRequestType('Feature')
    setDescription('')
    setCapitalizable(false)
    const dev = loadDevAuthFromStorage()
    setEmail(dev.email || '')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={!hasApi}
          title={!hasApi ? 'Set VITE_TAILS_API_URL in .env to enable Jira tickets' : undefined}
          className={cn(
            'text-muted-foreground hover:text-foreground text-sm underline-offset-4 transition-colors',
            'disabled:pointer-events-none disabled:opacity-50',
            hasApi && 'hover:underline',
          )}
        >
          Submit a feature request
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        {success ? (
          <>
            <DialogHeader>
              <DialogTitle>Ticket created</DialogTitle>
              <DialogDescription>
                {success.issue_key} was created in Jira. You can open it below or close this dialog.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="rounded-lg" asChild>
                <a href={success.issue_url} target="_blank" rel="noopener noreferrer">
                  Open {success.issue_key} in Jira
                </a>
              </Button>
              <Button type="button" variant="outline" className="rounded-lg" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const t = title.trim()
              const d = description.trim()
              const em = email.trim()
              if (!t || !d || !em) return
              setSubmitting(true)
              setError(null)
              try {
                const data = await apiFetchJson<FeatureRequestResponse>('/feedback/feature-request', {
                  method: 'POST',
                  body: JSON.stringify({
                    title: t,
                    request_type: requestType,
                    description: d,
                    submitter_email: em,
                    capitalizable,
                  }),
                })
                if (data?.issue_key && data?.issue_url) setSuccess(data)
                else setError('Unexpected response from server.')
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not submit. Check your connection.')
              } finally {
                setSubmitting(false)
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Submit a feature request</DialogTitle>
              <DialogDescription>
                Creates a Jira ticket in the Tails project — same flow as the classic Tails UI.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="fr-title">Title</Label>
                <Input
                  id="fr-title"
                  name="title"
                  required
                  maxLength={255}
                  autoComplete="off"
                  placeholder="Short summary"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fr-type">Request type</Label>
                <select
                  id="fr-type"
                  name="request_type"
                  required
                  className={selectClass}
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value as 'Feature' | 'Bug')}
                >
                  <option value="Feature">Feature</option>
                  <option value="Bug">Bug</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fr-desc">Description</Label>
                <Textarea
                  id="fr-desc"
                  name="description"
                  required
                  rows={5}
                  placeholder="Describe the feature, use case, and any context that would help."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[120px] rounded-lg"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fr-email">Your Chewy email</Label>
                <Input
                  id="fr-email"
                  name="submitter_email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@chewy.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="fr-cap"
                  name="capitalizable"
                  type="checkbox"
                  checked={capitalizable}
                  onChange={(e) => setCapitalizable(e.target.checked)}
                  className="border-input size-4 rounded border"
                />
                <Label htmlFor="fr-cap" className="text-muted-foreground font-normal">
                  Capitalizable (optional)
                </Label>
              </div>
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="rounded-lg" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-lg" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
