import { useEffect, useLayoutEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlignLeftIcon,
  ArrowLeftIcon,
  BracesIcon,
  DatabaseIcon,
  GaugeIcon,
  LayoutListIcon,
  TagsIcon,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { apiFetchJson } from '@/lib/api'
import { issuesByBodyField, parseFastApiIssuesFromErrorMessage } from '@/lib/fastapi-field-errors'
import {
  clearStashedMetricDuplicate,
  readStashedMetricDuplicate,
} from '@/lib/new-metric-duplicate'
import { pickAirflowTriggerFromMetricResponse } from '@/lib/metric-airflow-trigger'
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

type MetricCreateResponse = {
  metric?: Record<string, unknown>
  id?: string
  airflow_trigger?: unknown
}

type MetricFieldKey =
  | 'metricName'
  | 'description'
  | 'unit'
  | 'collectionWindow'
  | 'sourceSql'
  | 'tags'
  | 'form'

type MetricFieldErrors = Partial<Record<MetricFieldKey, string>>

const METRIC_BODY_TO_FIELD: Record<string, MetricFieldKey> = {
  metric_name: 'metricName',
  description: 'description',
  default_metric_format: 'unit',
  collection_window: 'collectionWindow',
  source_connector: 'collectionWindow',
  source_sql: 'sourceSql',
  tags: 'tags',
}

function mergeMetricApiErrorMessage(message: string): MetricFieldErrors {
  const issues = parseFastApiIssuesFromErrorMessage(message)
  if (!issues.length) {
    const m = message.toLowerCase()
    if (m.includes('sql') || m.includes('record_dttm') || m.includes('source_sql')) {
      return { sourceSql: message }
    }
    return { form: message }
  }
  const byBody = issuesByBodyField(issues)
  const out: MetricFieldErrors = {}
  const unmapped: string[] = []
  for (const [k, v] of Object.entries(byBody)) {
    const fk = METRIC_BODY_TO_FIELD[k]
    if (fk) {
      out[fk] = out[fk] ? `${out[fk]} ${v}` : v
    } else {
      unmapped.push(v)
    }
  }
  if (unmapped.length) {
    out.form = [out.form, ...unmapped].filter(Boolean).join(' ')
  }
  return Object.keys(out).length ? out : { form: message }
}

function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-destructive text-sm leading-snug" role="alert">
      {message}
    </p>
  )
}

function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export function NewMetricPage() {
  const navigate = useNavigate()
  const [prefilledFromName, setPrefilledFromName] = useState<string | null>(null)
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
  const [fieldErrors, setFieldErrors] = useState<MetricFieldErrors>({})

  const clearField = (key: MetricFieldKey) => {
    setFieldErrors((prev) => {
      if (prev[key] == null) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const tags = useMemo(() => parseTags(tagsInput), [tagsInput])

  useEffect(() => {
    if (sourceMode === 'edldb') {
      setCollectionWindow((w) => (w === 'MANUAL_COLLECTION' ? 'LATE_MORNING' : w))
    } else {
      setCollectionWindow('MANUAL_COLLECTION')
    }
  }, [sourceMode])

  useLayoutEffect(() => {
    const d = readStashedMetricDuplicate()
    if (!d) return

    setMetricName('')
    setDescription(d.description)
    setTagsInput(d.tagsCsv)
    setSourceSql(d.sourceSql)
    if (d.defaultMetricFormat) setUnit(d.defaultMetricFormat)

    const manual = d.sourceConnector === 'MANUAL_ENTRY'
    setSourceMode(manual ? 'manual' : 'edldb')
    if (!manual) {
      if (d.collectionWindow === 'LATE_AFTERNOON') setCollectionWindow('LATE_AFTERNOON')
      else setCollectionWindow('LATE_MORNING')
    }

    if (d.sourceMetricName.trim()) {
      setPrefilledFromName(d.sourceMetricName.trim())
    }

    const clearId = window.setTimeout(() => clearStashedMetricDuplicate(), 600)
    return () => window.clearTimeout(clearId)
  }, [])

  const sourceSummary =
    sourceMode === 'manual'
      ? 'Manual entry · placeholder-friendly SQL'
      : `Snowflake (EDLDB) · ${collectionWindow === 'LATE_MORNING' ? 'Late morning' : collectionWindow === 'LATE_AFTERNOON' ? 'Late afternoon' : 'Pick a window'}`

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    if (!metricName.trim()) {
      setFieldErrors({ metricName: 'Metric name is required.' })
      return
    }
    if (!description.trim()) {
      setFieldErrors({ description: 'Description is required.' })
      return
    }
    if (!unit.trim()) {
      setFieldErrors({ unit: 'Choose a display format.' })
      return
    }

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
        setFieldErrors({ collectionWindow: 'Pick a refresh window for Snowflake metrics.' })
        return
      }
      collection_window = collectionWindow
      sql = sourceSql.trim()
      if (!sql) {
        setFieldErrors({
          sourceSql: 'Source SQL is required for Snowflake (must return record_dttm and value).',
        })
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
      clearStashedMetricDuplicate()
      const airflowTrigger = pickAirflowTriggerFromMetricResponse(res)
      void navigate(`/metrics/${encodeURIComponent(id)}`, {
        state: airflowTrigger?.dag_run_id ? { airflowTrigger } : undefined,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed'
      setFieldErrors(mergeMetricApiErrorMessage(msg))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8 pb-12">
      <Button variant="ghost" size="sm" className="gap-1.5 rounded-lg text-muted-foreground hover:text-foreground" asChild>
        <Link to="/metrics">
          <ArrowLeftIcon className="size-4" />
          All metrics
        </Link>
      </Button>

      <header className="border-border/70 from-primary/10 via-card to-muted/30 relative overflow-hidden rounded-2xl border bg-linear-to-br p-8 shadow-sm sm:p-10">
        <div className="relative max-w-2xl space-y-3">
          <p className="text-primary text-xs font-semibold tracking-widest uppercase">Definitions</p>
          <h1 className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">Create a metric</h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Capture the definition and how data flows in. SQL, schedules, and metadata can be refined on the metric
            detail page after you save.
          </p>
        </div>
      </header>

      {prefilledFromName ? (
        <div
          className="border-primary/25 bg-primary/5 text-foreground rounded-2xl border px-4 py-3 text-sm leading-relaxed"
          role="status"
        >
          Prefilled from{' '}
          <span className="font-medium">{prefilledFromName}</span>
          . Enter a <span className="font-medium">new metric name</span> below — everything else matches the source
          definition.
        </div>
      ) : null}

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-8" noValidate>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">
            <Card className="rounded-2xl border-border/80 py-0 shadow-sm">
              <CardHeader className="border-border/60 flex flex-row items-start gap-4 border-b px-6 py-5">
                <div className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
                  <GaugeIcon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg">Definition</CardTitle>
                  <CardDescription>Name, how values read to humans, and what the number represents.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 px-6 py-6">
                <div className="space-y-2">
                  <Label htmlFor="new-metric-name" className="text-foreground text-sm font-medium">
                    Metric name
                  </Label>
                  <Input
                    id="new-metric-name"
                    value={metricName}
                    onChange={(e) => {
                      setMetricName(e.target.value)
                      clearField('metricName')
                    }}
                    required
                    placeholder="e.g. Units shipped"
                    className="h-11 rounded-xl text-base sm:h-12"
                    aria-invalid={Boolean(fieldErrors.metricName)}
                    aria-describedby={fieldErrors.metricName ? 'new-metric-name-error' : undefined}
                  />
                  <FieldError id="new-metric-name-error" message={fieldErrors.metricName} />
                </div>
                <div className="space-y-3">
                  <span className="text-foreground text-sm font-medium">Display format</span>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Display format">
                    {FORMAT_OPTIONS.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        size="sm"
                        variant={unit === opt.value ? 'default' : 'outline'}
                        className="h-10 min-w-[3.25rem] rounded-xl px-4 font-normal"
                        aria-pressed={unit === opt.value}
                        onClick={() => {
                          setUnit(opt.value)
                          clearField('unit')
                        }}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                  <FieldError id="new-metric-unit-error" message={fieldErrors.unit} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-metric-desc" className="text-foreground text-sm font-medium">
                    Description
                  </Label>
                  <Textarea
                    id="new-metric-desc"
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value)
                      clearField('description')
                    }}
                    rows={4}
                    required
                    placeholder="What this metric measures and how it should be interpreted"
                    className="min-h-[6rem] resize-y rounded-xl"
                    aria-invalid={Boolean(fieldErrors.description)}
                    aria-describedby={fieldErrors.description ? 'new-metric-desc-error' : undefined}
                  />
                  <FieldError id="new-metric-desc-error" message={fieldErrors.description} />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/80 py-0 shadow-sm">
              <CardHeader className="border-border/60 flex flex-row items-start gap-4 border-b px-6 py-5">
                <div className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
                  <DatabaseIcon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg">Data pipeline</CardTitle>
                  <CardDescription>Choose where values come from and how often they refresh.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 px-6 py-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSourceMode('manual')
                      clearField('collectionWindow')
                      clearField('sourceSql')
                    }}
                    className={cn(
                      'border-border/80 hover:border-primary/30 rounded-2xl border bg-card p-5 text-left transition-colors',
                      sourceMode === 'manual' && 'border-primary bg-primary/5 ring-primary/20 ring-2',
                    )}
                  >
                    <p className="text-foreground font-semibold">Manual</p>
                    <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                      Starts with placeholder SQL. Best when wiring the metric before the warehouse query is ready.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSourceMode('edldb')
                      clearField('collectionWindow')
                      clearField('sourceSql')
                    }}
                    className={cn(
                      'border-border/80 hover:border-primary/30 rounded-2xl border bg-card p-5 text-left transition-colors',
                      sourceMode === 'edldb' && 'border-primary bg-primary/5 ring-primary/20 ring-2',
                    )}
                  >
                    <p className="text-foreground font-semibold">Snowflake</p>
                    <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                      Live query against EDLDB. Requires SQL returning <code className="text-foreground">record_dttm</code>{' '}
                      and <code className="text-foreground">value</code>.
                    </p>
                  </button>
                </div>

                {sourceMode === 'edldb' ? (
                  <div className="space-y-3">
                    <span className="text-foreground text-sm font-medium">Refresh window</span>
                    <div className="grid max-w-lg gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCollectionWindow('LATE_MORNING')
                          clearField('collectionWindow')
                        }}
                        className={cn(
                          'border-border/80 rounded-xl border p-3 text-left text-sm transition-colors',
                          collectionWindow === 'LATE_MORNING' && 'border-primary bg-primary/5 ring-primary/15 ring-2',
                        )}
                      >
                        <span className="font-medium">Late morning</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCollectionWindow('LATE_AFTERNOON')
                          clearField('collectionWindow')
                        }}
                        className={cn(
                          'border-border/80 rounded-xl border p-3 text-left text-sm transition-colors',
                          collectionWindow === 'LATE_AFTERNOON' && 'border-primary bg-primary/5 ring-primary/15 ring-2',
                        )}
                      >
                        <span className="font-medium">Late afternoon</span>
                      </button>
                    </div>
                    <FieldError id="new-metric-window-error" message={fieldErrors.collectionWindow} />
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/80 py-0 shadow-sm">
              <CardHeader className="border-border/60 flex flex-row items-start gap-4 border-b px-6 py-5">
                <div className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
                  <BracesIcon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg">Source SQL</CardTitle>
                  <CardDescription>
                    {sourceMode === 'manual'
                      ? 'Optional for manual — empty uses a valid no-row placeholder until you paste real SQL.'
                      : 'Required for Snowflake. Must return record_dttm and value columns.'}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 px-6 py-6">
                <div className="bg-muted/40 border-border/60 rounded-xl border p-1">
                  <Textarea
                    id="new-metric-sql"
                    value={sourceSql}
                    onChange={(e) => {
                      setSourceSql(e.target.value)
                      clearField('sourceSql')
                    }}
                    rows={sourceMode === 'manual' ? 5 : 8}
                    placeholder={
                      sourceMode === 'manual'
                        ? 'Optional — leave empty for a valid no-row query'
                        : 'SELECT record_dttm, value FROM …'
                    }
                    className="border-0 bg-transparent font-mono text-[0.8rem] leading-relaxed shadow-none focus-visible:ring-0"
                    spellCheck={false}
                    aria-invalid={Boolean(fieldErrors.sourceSql)}
                    aria-describedby={fieldErrors.sourceSql ? 'new-metric-sql-error' : undefined}
                  />
                </div>
                <FieldError id="new-metric-sql-error" message={fieldErrors.sourceSql} />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/80 py-0 shadow-sm">
              <CardHeader className="border-border/60 flex flex-row items-start gap-4 border-b px-6 py-5">
                <div className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
                  <TagsIcon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg">Tags</CardTitle>
                  <CardDescription>Optional — comma-separated for search and grouping.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 px-6 py-6">
                <Input
                  id="new-metric-tags"
                  value={tagsInput}
                  onChange={(e) => {
                    setTagsInput(e.target.value)
                    clearField('tags')
                  }}
                  placeholder="e.g. core, weekly"
                  className="h-11 rounded-xl"
                  aria-invalid={Boolean(fieldErrors.tags)}
                  aria-describedby={fieldErrors.tags ? 'new-metric-tags-error' : undefined}
                />
                <FieldError id="new-metric-tags-error" message={fieldErrors.tags} />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/80 py-0 shadow-sm">
              <CardContent className="flex flex-col gap-3 px-6 py-6 sm:gap-4">
                {fieldErrors.form ? (
                  <div
                    className="bg-destructive/8 text-destructive border-destructive/25 rounded-xl border px-3 py-2 text-sm"
                    role="alert"
                  >
                    {fieldErrors.form}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                <Button type="button" variant="ghost" className="rounded-xl" asChild>
                  <Link to="/metrics">Cancel</Link>
                </Button>
                <Button type="submit" size="lg" className="rounded-xl px-8" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create metric'}
                </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4">
            <Card className="rounded-2xl border-border/80 bg-muted/15 py-0 shadow-sm">
              <CardHeader className="px-5 py-4">
                <CardTitle className="text-base">Summary</CardTitle>
                <CardDescription>What you are about to create</CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground space-y-3 px-5 pb-5 text-sm">
                <div className="border-border/60 space-y-1 border-b pb-3">
                  <p className="text-foreground text-xs font-medium tracking-wide uppercase">Name</p>
                  <p className="text-foreground text-sm font-medium leading-snug">
                    {metricName.trim() || 'Untitled metric'}
                  </p>
                </div>
                <div className="flex justify-between gap-2 text-xs">
                  <span className="font-medium">Format</span>
                  <span className="text-foreground">{unit || '—'}</span>
                </div>
                <div className="space-y-1 text-xs">
                  <span className="font-medium">Source</span>
                  <p className="text-foreground leading-snug">{sourceSummary}</p>
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
                  <CardTitle className="text-base">Next steps</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-muted-foreground space-y-2 px-5 pb-5 text-sm leading-relaxed">
                <p className="flex gap-2">
                  <AlignLeftIcon className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
                  <span>Edit SQL, dimensions, and Airflow wiring from the detail tabs.</span>
                </p>
                <p className="flex gap-2">
                  <DatabaseIcon className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
                  <span>Switching from manual to Snowflake later is a detail-page change.</span>
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </form>
    </div>
  )
}
