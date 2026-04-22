import { useMemo, useState, type FormEvent } from 'react'
import {
  ArrowLeftIcon,
  CalendarClockIcon,
  Code2Icon,
  FileTextIcon,
  LayoutListIcon,
  SparklesIcon,
  TagsIcon,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { apiFetchJson } from '@/lib/api'
import { DEFAULT_REPORT_BUILDER_TEMPLATE } from '@/lib/default-report-template'
import { cn } from '@/lib/utils'

type ReportCreateResponse = {
  id?: string
  report_id?: string
}

const STATUS_OPTIONS = [
  { value: 'draft' as const, label: 'Draft' },
  { value: 'published' as const, label: 'Published' },
  { value: 'archived' as const, label: 'Archived' },
]

function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export function NewReportPage() {
  const navigate = useNavigate()
  const [reportName, setReportName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft')
  const [publishWindow, setPublishWindow] = useState<'LATE_MORNING' | 'LATE_AFTERNOON' | ''>('')
  const [tagsInput, setTagsInput] = useState('')
  const [template, setTemplate] = useState(DEFAULT_REPORT_BUILDER_TEMPLATE)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const tags = useMemo(() => parseTags(tagsInput), [tagsInput])

  const windowLabel =
    publishWindow === 'LATE_MORNING'
      ? 'Late morning'
      : publishWindow === 'LATE_AFTERNOON'
        ? 'Late afternoon'
        : 'Not selected'

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!reportName.trim()) {
      setFormError('Report name is required.')
      return
    }
    if (!publishWindow) {
      setFormError('Choose a publish window.')
      return
    }
    setSubmitting(true)
    try {
      const body = {
        report_name: reportName.trim(),
        description: description.trim() || null,
        status,
        tags,
        key_dimension_combinations: [] as Record<string, string>[],
        publish_window: publishWindow,
        template: template.trim() || undefined,
      }
      const res = await apiFetchJson<ReportCreateResponse>('/reports', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const id = String(res.id ?? res.report_id ?? '')
      if (!id) throw new Error('API did not return a report id')
      void navigate(`/reports/${encodeURIComponent(id)}`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8 pb-12">
      <Button variant="ghost" size="sm" className="gap-1.5 rounded-lg text-muted-foreground hover:text-foreground" asChild>
        <Link to="/reports">
          <ArrowLeftIcon className="size-4" />
          All reports
        </Link>
      </Button>

      <header className="border-border/70 from-primary/10 via-card to-muted/30 relative overflow-hidden rounded-2xl border bg-linear-to-br p-8 shadow-sm sm:p-10">
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-primary text-xs font-semibold tracking-widest uppercase">Catalog</p>
            <h1 className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">Create a report</h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              Start with a clear name and schedule. Template and tags are easy to change later from the report page or
              builder.
            </p>
          </div>
          <div className="text-muted-foreground flex items-center gap-2 text-sm lg:pb-1">
            <SparklesIcon className="text-primary/70 size-5 shrink-0" aria-hidden />
            <span className="max-w-xs leading-snug">You will open the live report as soon as it is created.</span>
          </div>
        </div>
      </header>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-8">
        {formError ? (
          <div
            className="bg-destructive/8 text-destructive border-destructive/25 rounded-2xl border px-4 py-3 text-sm"
            role="alert"
          >
            {formError}
          </div>
        ) : null}

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">
            <Card className="rounded-2xl border-border/80 py-0 shadow-sm">
              <CardHeader className="border-border/60 flex flex-row items-start gap-4 border-b px-6 py-5">
                <div className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
                  <FileTextIcon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg">Identity</CardTitle>
                  <CardDescription>What readers will see in the catalog and on the report.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 px-6 py-6">
                <div className="space-y-2">
                  <Label htmlFor="new-report-name" className="text-foreground text-sm font-medium">
                    Report name
                  </Label>
                  <Input
                    id="new-report-name"
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                    placeholder="e.g. Weekly ops snapshot"
                    required
                    className="h-11 rounded-xl text-base sm:h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-report-desc" className="text-foreground text-sm font-medium">
                    Description
                  </Label>
                  <Textarea
                    id="new-report-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="One or two sentences on what this report is for"
                    className="min-h-[5.5rem] resize-y rounded-xl"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/80 py-0 shadow-sm">
              <CardHeader className="border-border/60 flex flex-row items-start gap-4 border-b px-6 py-5">
                <div className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
                  <CalendarClockIcon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg">Lifecycle & schedule</CardTitle>
                  <CardDescription>Status controls visibility; publish window ties into your delivery rhythm.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 px-6 py-6">
                <div className="space-y-3">
                  <span className="text-foreground text-sm font-medium">Status</span>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Report status">
                    {STATUS_OPTIONS.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        size="sm"
                        variant={status === opt.value ? 'default' : 'outline'}
                        className="h-10 rounded-xl px-5 font-normal"
                        aria-pressed={status === opt.value}
                        onClick={() => setStatus(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <span className="text-foreground text-sm font-medium">Publish window</span>
                  <div className="grid max-w-lg gap-3 sm:grid-cols-2" role="group" aria-label="Publish window">
                    <button
                      type="button"
                      onClick={() => setPublishWindow('LATE_MORNING')}
                      className={cn(
                        'border-border/80 hover:border-primary/30 rounded-2xl border bg-card p-4 text-left transition-colors',
                        publishWindow === 'LATE_MORNING' && 'border-primary bg-primary/5 ring-primary/20 ring-2',
                      )}
                    >
                      <p className="text-foreground font-medium">Late morning</p>
                      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">Morning batch window</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPublishWindow('LATE_AFTERNOON')}
                      className={cn(
                        'border-border/80 hover:border-primary/30 rounded-2xl border bg-card p-4 text-left transition-colors',
                        publishWindow === 'LATE_AFTERNOON' && 'border-primary bg-primary/5 ring-primary/20 ring-2',
                      )}
                    >
                      <p className="text-foreground font-medium">Late afternoon</p>
                      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">Afternoon batch window</p>
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/80 py-0 shadow-sm">
              <CardHeader className="border-border/60 flex flex-row items-start gap-4 border-b px-6 py-5">
                <div className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
                  <Code2Icon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg">Starter template</CardTitle>
                  <CardDescription>
                    Default HTML scaffold. Skip heavy edits here — the report builder is better for long sessions.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="px-6 py-6">
                <div className="bg-muted/40 border-border/60 rounded-xl border p-1">
                  <Textarea
                    id="new-report-template"
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    rows={12}
                    className="border-0 bg-transparent font-mono text-[0.8rem] leading-relaxed shadow-none focus-visible:ring-0"
                    spellCheck={false}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/80 py-0 shadow-sm">
              <CardHeader className="border-border/60 flex flex-row items-start gap-4 border-b px-6 py-5">
                <div className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
                  <TagsIcon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg">Tags</CardTitle>
                  <CardDescription>Optional — comma-separated labels for search and grouping.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="px-6 py-6">
                <Input
                  id="new-report-tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. ops, weekly, leadership"
                  className="h-11 rounded-xl"
                />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/80 py-0 shadow-sm">
              <CardContent className="flex flex-wrap items-center justify-end gap-2 px-6 py-6 sm:gap-3">
                <Button type="button" variant="ghost" className="rounded-xl" asChild>
                  <Link to="/reports">Cancel</Link>
                </Button>
                <Button type="submit" size="lg" className="rounded-xl px-8" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create report'}
                </Button>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4">
            <Card className="rounded-2xl border-border/80 bg-muted/15 py-0 shadow-sm">
              <CardHeader className="px-5 py-4">
                <CardTitle className="text-base">Summary</CardTitle>
                <CardDescription>How this report will be created</CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground space-y-3 px-5 pb-5 text-sm">
                <div className="border-border/60 space-y-1 border-b pb-3">
                  <p className="text-foreground text-xs font-medium tracking-wide uppercase">Name</p>
                  <p className="text-foreground text-sm font-medium leading-snug">
                    {reportName.trim() || 'Untitled report'}
                  </p>
                </div>
                <div className="flex justify-between gap-2 text-xs">
                  <span className="font-medium">Status</span>
                  <span className="text-foreground capitalize">{status}</span>
                </div>
                <div className="flex justify-between gap-2 text-xs">
                  <span className="font-medium">Window</span>
                  <span className="text-foreground text-right">{windowLabel}</span>
                </div>
                <div className="flex justify-between gap-2 text-xs">
                  <span className="font-medium">Tags</span>
                  <span className="text-foreground">{tags.length ? `${tags.length} tag(s)` : 'None'}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-dashed border-border/90 py-0 shadow-none">
              <CardHeader className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <LayoutListIcon className="text-muted-foreground size-4" aria-hidden />
                  <CardTitle className="text-base">Checklist</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-muted-foreground space-y-2 px-5 pb-5 text-sm leading-relaxed">
                <p>• Name and publish window are required before create.</p>
                <p>• Draft is safest if you are still iterating on copy.</p>
                <p>• After create, use the report view and builder to wire metrics.</p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </form>
    </div>
  )
}
