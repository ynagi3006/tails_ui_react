import { useState, type ReactNode } from 'react'

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
import { apiFetchJson } from '@/lib/api'
import { DEFAULT_REPORT_BUILDER_TEMPLATE } from '@/lib/default-report-template'
import { cn } from '@/lib/utils'

type CreateReportDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactNode
  onCreated?: (reportId: string) => void
}

type ReportCreateResponse = {
  id?: string
  report_id?: string
}

function Section({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <h3 className="text-muted-foreground text-[0.65rem] font-semibold tracking-wider uppercase">{title}</h3>
      {children}
    </section>
  )
}

const STATUS_OPTIONS = [
  { value: 'draft' as const, label: 'Draft' },
  { value: 'published' as const, label: 'Published' },
  { value: 'archived' as const, label: 'Archived' },
]

export function CreateReportDialog({
  open: controlledOpen,
  onOpenChange,
  trigger,
  onCreated,
}: CreateReportDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const [reportName, setReportName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft')
  const [publishWindow, setPublishWindow] = useState<'LATE_MORNING' | 'LATE_AFTERNOON' | ''>('')
  const [tagsInput, setTagsInput] = useState('')
  const [template, setTemplate] = useState(DEFAULT_REPORT_BUILDER_TEMPLATE)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const resetForm = () => {
    setReportName('')
    setDescription('')
    setStatus('draft')
    setPublishWindow('')
    setTagsInput('')
    setTemplate(DEFAULT_REPORT_BUILDER_TEMPLATE)
    setFormError(null)
  }

  const onSubmit = async (e: React.FormEvent) => {
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
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
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
      setOpen(false)
      resetForm()
      onCreated?.(id)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) resetForm()
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        className="max-h-[min(92vh,900px)] gap-0 overflow-y-auto p-0 sm:max-w-2xl"
        showCloseButton
      >
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col">
          <DialogHeader className="border-border/60 space-y-1.5 border-b px-6 py-5 text-left">
            <DialogTitle className="text-lg font-semibold tracking-tight">New report</DialogTitle>
            <DialogDescription className="sr-only">Create a new report.</DialogDescription>
          </DialogHeader>

          <div className="space-y-8 px-6 py-6">
            {formError ? (
              <p
                className="bg-destructive/8 text-destructive border-destructive/20 rounded-lg border px-3 py-2 text-sm"
                role="alert"
              >
                {formError}
              </p>
            ) : null}

            <Section title="Basics">
              <div className="space-y-2">
                <Label htmlFor="cr-name" className="text-foreground text-xs font-medium">
                  Name
                </Label>
                <Input
                  id="cr-name"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  placeholder="e.g. Weekly ops snapshot"
                  required
                  className="h-10 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cr-desc" className="text-foreground text-xs font-medium">
                  Description
                </Label>
                <Textarea
                  id="cr-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What this report shows"
                  className="min-h-[4.5rem] resize-none rounded-lg"
                />
              </div>
            </Section>

            <Section title="Publishing">
              <div className="space-y-2">
                <span className="text-foreground text-xs font-medium">Status</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Report status">
                  {STATUS_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant={status === opt.value ? 'default' : 'outline'}
                      className="h-9 rounded-lg px-4 font-normal"
                      aria-pressed={status === opt.value}
                      onClick={() => setStatus(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-foreground text-xs font-medium">Publish window</span>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Publish window">
                  <Button
                    type="button"
                    size="sm"
                    variant={publishWindow === 'LATE_MORNING' ? 'secondary' : 'outline'}
                    className="h-10 rounded-lg font-normal"
                    aria-pressed={publishWindow === 'LATE_MORNING'}
                    onClick={() => setPublishWindow('LATE_MORNING')}
                  >
                    Late morning
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={publishWindow === 'LATE_AFTERNOON' ? 'secondary' : 'outline'}
                    className="h-10 rounded-lg font-normal"
                    aria-pressed={publishWindow === 'LATE_AFTERNOON'}
                    onClick={() => setPublishWindow('LATE_AFTERNOON')}
                  >
                    Late afternoon
                  </Button>
                </div>
              </div>
            </Section>

            <Section title="Template">
              <Textarea
                id="cr-template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={9}
                className="font-mono text-[0.8rem] leading-relaxed rounded-lg"
                spellCheck={false}
              />
            </Section>

            <Section title="Tags" className="pb-0">
              <div className="space-y-2">
                <Label htmlFor="cr-tags" className="text-muted-foreground text-xs font-normal">
                  Optional — comma-separated
                </Label>
                <Input
                  id="cr-tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. ops, weekly"
                  className="h-10 rounded-lg"
                />
              </div>
            </Section>
          </div>

          <DialogFooter className="m-0 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border/60 bg-muted/25 px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl px-5" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create report'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
