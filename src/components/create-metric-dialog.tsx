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
import { apiFetchJson } from '@/lib/api'
import { metricIdFromRow } from '@/lib/parse-metric-response'
import { cn } from '@/lib/utils'

/** Passes Snowflake SQL validation (record_dttm + value). Used when source is manual / placeholder. */
const MANUAL_SQL_PLACEHOLDER =
  'SELECT CURRENT_TIMESTAMP() AS record_dttm, 0 AS value WHERE 1=0'

const FORMAT_OPTIONS = [
  { value: '$', label: '$' },
  { value: '%', label: '%' },
  { value: 'Integer', label: 'Int' },
  { value: 'Decimal', label: 'Decimal' },
] as const

type CreateMetricDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
  onCreated?: (metricId: string) => void
}

type MetricCreateResponse = {
  metric?: Record<string, unknown>
  id?: string
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

export function CreateMetricDialog({
  open: controlledOpen,
  onOpenChange,
  trigger,
  onCreated,
}: CreateMetricDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const [metricName, setMetricName] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('')
  const [sourceMode, setSourceMode] = useState<'edldb' | 'manual'>('manual')
  const [collectionWindow, setCollectionWindow] = useState<'LATE_MORNING' | 'LATE_AFTERNOON' | 'MANUAL_COLLECTION'>(
    'MANUAL_COLLECTION',
  )
  const [sourceSql, setSourceSql] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (sourceMode === 'edldb') {
      setCollectionWindow((w) => (w === 'MANUAL_COLLECTION' ? 'LATE_MORNING' : w))
    } else {
      setCollectionWindow('MANUAL_COLLECTION')
    }
  }, [sourceMode])

  const resetForm = () => {
    setMetricName('')
    setDescription('')
    setUnit('')
    setSourceMode('manual')
    setCollectionWindow('MANUAL_COLLECTION')
    setSourceSql('')
    setTagsInput('')
    setFormError(null)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!metricName.trim()) {
      setFormError('Metric name is required.')
      return
    }
    if (!description.trim()) {
      setFormError('Description is required.')
      return
    }
    if (!unit.trim()) {
      setFormError('Choose a display format.')
      return
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    let source_connector: string
    let collection_window: string
    let sql: string

    if (sourceMode === 'manual') {
      source_connector = 'MANUAL_ENTRY'
      collection_window = 'MANUAL_COLLECTION'
      sql = sourceSql.trim() || MANUAL_SQL_PLACEHOLDER
    } else {
      source_connector = 'SNOWFLAKE_EDLDB'
      if (collectionWindow === 'MANUAL_COLLECTION') {
        setFormError('Pick a refresh window for Snowflake metrics.')
        return
      }
      collection_window = collectionWindow
      sql = sourceSql.trim()
      if (!sql) {
        setFormError('Source SQL is required for Snowflake (must return record_dttm and value).')
        return
      }
    }

    setSubmitting(true)
    try {
      const body = {
        metric_name: metricName.trim(),
        description: description.trim(),
        default_metric_format: unit.trim(),
        default_date_format: 'YYYY-MM-DD',
        tags,
        metadata: {} as Record<string, unknown>,
        source_connector,
        collection_window,
        source_sql: sql,
      }
      const res = await apiFetchJson<MetricCreateResponse>('/metrics', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const m = res.metric ?? res
      const id = metricIdFromRow(m as Record<string, unknown>)
      if (!id) throw new Error('API did not return a metric id')
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
        className="max-h-[min(92vh,860px)] gap-0 overflow-y-auto p-0 sm:max-w-[30rem]"
        showCloseButton
      >
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col">
          <DialogHeader className="border-border/60 space-y-1.5 border-b px-6 py-5 text-left">
            <DialogTitle className="text-lg font-semibold tracking-tight">New metric</DialogTitle>
            <DialogDescription className="sr-only">Create a new metric.</DialogDescription>
          </DialogHeader>

          <div className="space-y-8 px-6 py-6">
            {formError ? (
              <p className="bg-destructive/8 text-destructive border-destructive/20 rounded-lg border px-3 py-2 text-sm" role="alert">
                {formError}
              </p>
            ) : null}

            <Section title="Basics">
              <div className="space-y-2">
                <Label htmlFor="cm-name" className="text-foreground text-xs font-medium">
                  Name
                </Label>
                <Input
                  id="cm-name"
                  value={metricName}
                  onChange={(e) => setMetricName(e.target.value)}
                  required
                  placeholder="e.g. Units shipped"
                  className="h-10 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <span className="text-foreground text-xs font-medium">Display format</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Display format">
                  {FORMAT_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant={unit === opt.value ? 'default' : 'outline'}
                      className="h-9 min-w-[3.25rem] rounded-lg px-3 font-normal"
                      aria-pressed={unit === opt.value}
                      onClick={() => setUnit(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cm-desc" className="text-foreground text-xs font-medium">
                  Description
                </Label>
                <Textarea
                  id="cm-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  required
                  placeholder="What this metric measures"
                  className="min-h-[4.5rem] resize-none rounded-lg"
                />
              </div>
            </Section>

            <Section title="Data source">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Data source">
                <Button
                  type="button"
                  variant={sourceMode === 'manual' ? 'default' : 'outline'}
                  className="h-auto min-h-11 flex-col gap-0.5 rounded-xl py-2.5 font-medium"
                  aria-pressed={sourceMode === 'manual'}
                  onClick={() => setSourceMode('manual')}
                >
                  <span>Manual</span>
                  <span className="text-[0.65rem] font-normal opacity-80">Placeholder SQL</span>
                </Button>
                <Button
                  type="button"
                  variant={sourceMode === 'edldb' ? 'default' : 'outline'}
                  className="h-auto min-h-11 flex-col gap-0.5 rounded-xl py-2.5 font-medium"
                  aria-pressed={sourceMode === 'edldb'}
                  onClick={() => setSourceMode('edldb')}
                >
                  <span>Snowflake</span>
                  <span className="text-[0.65rem] font-normal opacity-80">EDLDB</span>
                </Button>
              </div>

              {sourceMode === 'edldb' ? (
                <div className="space-y-2 pt-1">
                  <span className="text-muted-foreground text-xs">Refresh window</span>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={collectionWindow === 'LATE_MORNING' ? 'secondary' : 'outline'}
                      className="h-10 rounded-lg font-normal"
                      aria-pressed={collectionWindow === 'LATE_MORNING'}
                      onClick={() => setCollectionWindow('LATE_MORNING')}
                    >
                      Late morning
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={collectionWindow === 'LATE_AFTERNOON' ? 'secondary' : 'outline'}
                      className="h-10 rounded-lg font-normal"
                      aria-pressed={collectionWindow === 'LATE_AFTERNOON'}
                      onClick={() => setCollectionWindow('LATE_AFTERNOON')}
                    >
                      Late afternoon
                    </Button>
                  </div>
                </div>
              ) : null}
            </Section>

            <Section title="SQL">
              <Textarea
                id="cm-sql"
                value={sourceSql}
                onChange={(e) => setSourceSql(e.target.value)}
                rows={sourceMode === 'manual' ? 3 : 5}
                placeholder={
                  sourceMode === 'manual'
                    ? 'Optional — leave empty for a valid no-row query'
                    : 'SELECT record_dttm, value FROM …'
                }
                className="font-mono text-[0.8rem] leading-relaxed rounded-lg"
                spellCheck={false}
              />
            </Section>

            <Section title="Tags" className="pb-0">
              <div className="space-y-2">
                <Label htmlFor="cm-tags" className="text-muted-foreground text-xs font-normal">
                  Optional — comma-separated
                </Label>
                <Input
                  id="cm-tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. core, weekly"
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
              {submitting ? 'Creating…' : 'Create metric'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
