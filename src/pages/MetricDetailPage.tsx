import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  FileCode2Icon,
  FileTextIcon,
  RefreshCwIcon,
  SaveIcon,
  Settings2Icon,
  TableIcon,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { MonacoField } from '@/components/monaco-field'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { apiFetchJson, getClassicUiMetricUrl } from '@/lib/api'
import { formatDate } from '@/lib/format-date'
import { metricNameFromRow, metricVersionIdFromRow } from '@/lib/parse-metric-response'
import { cn } from '@/lib/utils'

type MetricDetail = Record<string, unknown>

type MetricLatest = MetricDetail & {
  latest_value?: number | null
  latest_record_dttm?: string | null
}

type MetricPutResponse = {
  metric: MetricDetail
}

type MetricReportRow = {
  report_id: string
  report_name: string
}

type DatapointRow = {
  id?: string
  value?: number
  record_dttm?: string
  formatted_value?: string
}

type PageTab = 'overview' | 'definition' | 'sql'

const FORMAT_OPTIONS = [
  { value: '$', label: '$' },
  { value: '%', label: '%' },
  { value: 'Integer', label: 'Int' },
  { value: 'Decimal', label: 'Decimal' },
] as const

function pickStr(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k]
    if (v != null && String(v).trim()) return String(v)
  }
  return ''
}

/** API stores creator email in metadata.created_by on create; some responses may expose top-level created_by. */
function createdByFromMetric(m: Record<string, unknown>): string {
  const top = pickStr(m, 'created_by', 'createdBy')
  if (top) return top
  const meta = m.metadata
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const row = meta as Record<string, unknown>
    const cb = row.created_by ?? row.createdBy
    if (cb != null && String(cb).trim()) return String(cb)
  }
  return ''
}

function DefItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="text-foreground text-sm">{children}</dd>
    </>
  )
}

export function MetricDetailPage() {
  const { metricId = '' } = useParams<{ metricId: string }>()
  const [metric, setMetric] = useState<MetricDetail | null>(null)
  const [latest, setLatest] = useState<MetricLatest | null>(null)
  const [reports, setReports] = useState<MetricReportRow[]>([])
  const [datapoints, setDatapoints] = useState<DatapointRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<PageTab>('overview')

  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editFormat, setEditFormat] = useState('')
  const [editTags, setEditTags] = useState('')
  const [editConnector, setEditConnector] = useState('')
  const [editCollection, setEditCollection] = useState('')
  const [savingDef, setSavingDef] = useState(false)

  const [sqlDraft, setSqlDraft] = useState('')
  const [sqlLoaded, setSqlLoaded] = useState(false)
  const [sqlLoading, setSqlLoading] = useState(false)
  const [sqlBaseline, setSqlBaseline] = useState('')
  const [savingSql, setSavingSql] = useState(false)

  const [statusMsg, setStatusMsg] = useState<{ text: string; error?: boolean } | null>(null)

  const load = useCallback(async () => {
    if (!metricId) return
    setLoading(true)
    setError(null)
    try {
      const m = await apiFetchJson<MetricDetail>(`/metrics/${encodeURIComponent(metricId)}`)
      setMetric(m)
      const mvid = metricVersionIdFromRow(m)
      try {
        const withDp = await apiFetchJson<MetricLatest>(`/metrics/${encodeURIComponent(metricId)}/latest`)
        setLatest(withDp)
      } catch {
        setLatest(null)
      }
      if (mvid) {
        try {
          const dps = await apiFetchJson<DatapointRow[]>(
            `/metrics/${encodeURIComponent(mvid)}/datapoints?limit=12&skip=0`,
          )
          setDatapoints(Array.isArray(dps) ? dps : [])
        } catch {
          setDatapoints([])
        }
        try {
          const list = await apiFetchJson<unknown[]>(`/metrics/version/${encodeURIComponent(mvid)}/reports`)
          setReports(
            Array.isArray(list)
              ? list.map((raw) => {
                  const row = raw as Record<string, unknown>
                  return {
                    report_id: String(row.report_id ?? ''),
                    report_name: String(row.report_name ?? 'Unnamed'),
                  }
                })
              : [],
          )
        } catch {
          setReports([])
        }
      } else {
        setReports([])
        setDatapoints([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metric')
      setMetric(null)
      setLatest(null)
      setReports([])
      setDatapoints([])
    } finally {
      setLoading(false)
    }
  }, [metricId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!metric) return
    setEditName(metricNameFromRow(metric))
    setEditDesc(pickStr(metric, 'description'))
    setEditFormat(pickStr(metric, 'default_metric_format'))
    setEditTags(
      Array.isArray(metric.tags) ? (metric.tags as unknown[]).map(String).join(', ') : '',
    )
    setEditConnector(pickStr(metric, 'source_connector'))
    setEditCollection(pickStr(metric, 'collection_window'))
  }, [metric])

  const loadSql = useCallback(async () => {
    if (!metricId) return
    setSqlLoading(true)
    setStatusMsg(null)
    try {
      const r = await apiFetchJson<{ sql: string }>(`/metrics/${encodeURIComponent(metricId)}/sql`)
      const s = r.sql ?? ''
      setSqlDraft(s)
      setSqlBaseline(s)
      setSqlLoaded(true)
    } catch {
      setSqlDraft('')
      setSqlBaseline('')
      setSqlLoaded(true)
    } finally {
      setSqlLoading(false)
    }
  }, [metricId])

  useEffect(() => {
    if (tab === 'sql' && !sqlLoaded && !sqlLoading) void loadSql()
  }, [tab, sqlLoaded, sqlLoading, loadSql])

  useEffect(() => {
    setSqlLoaded(false)
    setSqlDraft('')
    setSqlBaseline('')
  }, [metricId])

  const saveDefinition = async () => {
    if (!metricId) return
    setSavingDef(true)
    setStatusMsg(null)
    try {
      const tags = editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const res = await apiFetchJson<MetricPutResponse>(`/metrics/${encodeURIComponent(metricId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          metric_name: editName.trim(),
          description: editDesc.trim(),
          default_metric_format: editFormat.trim() || undefined,
          default_date_format: (metric && pickStr(metric, 'default_date_format')) || 'YYYY-MM-DD',
          tags,
          source_connector: editConnector.trim(),
          collection_window: editCollection.trim(),
        }),
      })
      setMetric(res.metric)
      setStatusMsg({ text: 'Metric definition saved.' })
      void load()
    } catch (e) {
      setStatusMsg({ text: e instanceof Error ? e.message : 'Save failed', error: true })
    } finally {
      setSavingDef(false)
    }
  }

  const saveSql = async () => {
    if (!metricId) return
    const sql = sqlDraft.trim()
    if (!sql) {
      setStatusMsg({ text: 'SQL cannot be empty.', error: true })
      return
    }
    setSavingSql(true)
    setStatusMsg(null)
    try {
      await apiFetchJson(`/metrics/${encodeURIComponent(metricId)}/sql`, {
        method: 'POST',
        body: JSON.stringify({ sql }),
      })
      setStatusMsg({
        text: 'SQL saved. A new metric version may have been created if the query changed.',
      })
      await load()
      await loadSql()
    } catch (e) {
      setStatusMsg({ text: e instanceof Error ? e.message : 'Save failed', error: true })
    } finally {
      setSavingSql(false)
    }
  }

  const mvid = metric ? metricVersionIdFromRow(metric) : ''
  const name = metric ? metricNameFromRow(metric) : ''
  const classic = mvid ? getClassicUiMetricUrl(mvid) : null

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="gap-1.5 rounded-lg" asChild>
        <Link to="/metrics">
          <ArrowLeftIcon className="size-4" />
          Metrics
        </Link>
      </Button>

      {error ? (
        <div
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-2xl border px-4 py-3 text-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {statusMsg ? (
        <p className={cn('text-sm', statusMsg.error ? 'text-destructive' : 'text-muted-foreground')} role="status">
          {statusMsg.text}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : metric ? (
        <>
          <div className="border-border/70 from-primary/8 via-card to-card relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 shadow-sm sm:p-8">
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 space-y-2">
                <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">Metric</p>
                <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
                {pickStr(metric, 'description') ? (
                  <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
                    {pickStr(metric, 'description')}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  {pickStr(metric, 'default_metric_format') ? (
                    <Badge variant="secondary" className="rounded-md font-normal">
                      {pickStr(metric, 'default_metric_format')}
                    </Badge>
                  ) : null}
                  {Array.isArray(metric.tags)
                    ? (metric.tags as unknown[]).map(String).map((t) => (
                        <Badge key={t} variant="outline" className="font-normal">
                          {t}
                        </Badge>
                      ))
                    : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
                <div className="border-border/60 bg-background/80 w-full rounded-2xl border px-5 py-4 text-left shadow-sm backdrop-blur-sm sm:min-w-[12rem] sm:text-right">
                  <p className="text-muted-foreground text-xs font-medium">Latest value</p>
                  {latest?.latest_value != null ? (
                    <p className="text-foreground text-3xl font-semibold tabular-nums tracking-tight">
                      {String(latest.latest_value)}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-lg">—</p>
                  )}
                  {latest?.latest_record_dttm ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Recorded {formatDate(latest.latest_record_dttm)}
                    </p>
                  ) : (
                    <p className="text-muted-foreground mt-1 text-xs">No datapoint yet</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => void load()}>
                    <RefreshCwIcon className="size-3.5" />
                    Refresh
                  </Button>
                  {classic ? (
                    <Button size="sm" className="gap-1.5 rounded-xl" asChild>
                      <a href={classic} target="_blank" rel="noreferrer">
                        Classic UI
                        <ExternalLinkIcon className="size-3.5 opacity-80" />
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="border-border/60 bg-muted/25 flex flex-wrap gap-1 rounded-full border p-1">
            {(
              [
                ['overview', 'Overview', TableIcon],
                ['definition', 'Definition', Settings2Icon],
                ['sql', 'Source SQL', FileCode2Icon],
              ] as const
            ).map(([id, label, Icon]) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={tab === id ? 'secondary' : 'ghost'}
                className="h-9 rounded-full px-4"
                onClick={() => setTab(id)}
              >
                <Icon className="mr-1.5 size-3.5 opacity-80" />
                {label}
              </Button>
            ))}
          </div>

          {tab === 'overview' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card
                role="button"
                tabIndex={0}
                onClick={() => setTab('definition')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setTab('definition')
                  }
                }}
                className="border-border/70 hover:border-primary/25 hover:bg-muted/20 focus-visible:ring-ring cursor-pointer rounded-2xl shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                    <DatabaseIcon className="size-4" />
                    Definition
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,7rem)_1fr] sm:gap-y-3">
                    <DefItem label="Owned by">{pickStr(metric, 'owned_by', 'ownedBy') || '—'}</DefItem>
                    <DefItem label="Created by">{createdByFromMetric(metric) || '—'}</DefItem>
                    <DefItem label="Connector">{pickStr(metric, 'source_connector') || '—'}</DefItem>
                    <DefItem label="Collection">
                      {pickStr(metric, 'collection_window') ? pickStr(metric, 'collection_window').replace(/_/g, ' ') : '—'}
                    </DefItem>
                    <DefItem label="Created at">
                      {pickStr(metric, 'created_at') ? formatDate(pickStr(metric, 'created_at')) : '—'}
                    </DefItem>
                  </dl>
                  <p className="text-muted-foreground mt-4 flex items-center gap-1 text-xs font-medium">
                    Edit definition
                    <ChevronRightIcon className="size-3.5 opacity-70" aria-hidden />
                  </p>
                </CardContent>
              </Card>

              <Card
                role="button"
                tabIndex={0}
                onClick={() => setTab('sql')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setTab('sql')
                  }
                }}
                className="border-border/70 hover:border-primary/25 hover:bg-muted/20 focus-visible:ring-ring cursor-pointer rounded-2xl shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                    <TableIcon className="size-4" />
                    Recent datapoints
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {datapoints.length === 0 ? (
                    <p className="text-muted-foreground text-sm leading-relaxed">No datapoints returned for this version.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border/60">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/40 border-b border-border/60">
                          <tr>
                            <th className="px-3 py-2 font-medium">Recorded</th>
                            <th className="px-3 py-2 font-medium">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {datapoints.map((dp) => (
                            <tr key={String(dp.id ?? dp.record_dttm)} className="border-border/40 border-b last:border-0">
                              <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                                {dp.record_dttm ? formatDate(dp.record_dttm) : '—'}
                              </td>
                              <td className="px-3 py-2 font-mono tabular-nums">
                                {dp.formatted_value != null ? String(dp.formatted_value) : dp.value != null ? String(dp.value) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="text-muted-foreground mt-4 flex items-center gap-1 text-xs font-medium">
                    View or edit source SQL
                    <ChevronRightIcon className="size-3.5 opacity-70" aria-hidden />
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/70 lg:col-span-2 rounded-2xl shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-muted-foreground text-sm font-medium">Reports using this metric</CardTitle>
                </CardHeader>
                <CardContent>
                  {reports.length === 0 ? (
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      No linked reports found for this metric version.
                    </p>
                  ) : (
                    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {reports.map((r, i) => (
                        <li key={r.report_id}>
                          <Link
                            to={`/reports/${encodeURIComponent(r.report_id)}`}
                            className={cn(
                              'border-border/70 bg-card hover:border-primary/30 hover:bg-muted/35 focus-visible:ring-ring group flex min-h-[4.25rem] items-center gap-3 rounded-xl border p-4 shadow-sm transition-all duration-200',
                              'animate-in fade-in slide-in-from-bottom-2 zoom-in-95 fill-mode-both ease-out',
                              'hover:-translate-y-0.5 hover:shadow-md',
                              'focus-visible:ring-2 focus-visible:outline-none',
                            )}
                            style={{ animationDuration: '380ms', animationDelay: `${Math.min(i, 12) * 45}ms` }}
                          >
                            <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-105">
                              <FileTextIcon className="size-5" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="text-foreground block font-medium leading-snug">{r.report_name}</span>
                              <span className="text-muted-foreground mt-0.5 block text-xs">Open report</span>
                            </span>
                            <ChevronRightIcon
                              className="text-muted-foreground size-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1"
                              aria-hidden
                            />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {tab === 'definition' ? (
            <Card className="border-border/70 rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Edit definition</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Updates the latest metric version in place when SQL is unchanged. Uses{' '}
                  <code className="text-xs">PUT /api/v1/metrics/{'{id}'}</code>.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="md-name">Name</Label>
                  <Input id="md-name" value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="md-desc">Description</Label>
                  <Textarea id="md-desc" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} className="rounded-lg" />
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium">Display format</span>
                  <div className="flex flex-wrap gap-1.5">
                    {FORMAT_OPTIONS.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        size="sm"
                        variant={editFormat === opt.value ? 'default' : 'outline'}
                        className="h-9 rounded-lg"
                        onClick={() => setEditFormat(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="md-tags">Tags (comma-separated)</Label>
                  <Input id="md-tags" value={editTags} onChange={(e) => setEditTags(e.target.value)} className="rounded-lg" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="md-conn">Source connector</Label>
                    <Input
                      id="md-conn"
                      value={editConnector}
                      onChange={(e) => setEditConnector(e.target.value)}
                      className="rounded-lg font-mono text-sm"
                      placeholder="SNOWFLAKE_EDLDB"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="md-coll">Collection window</Label>
                    <Input
                      id="md-coll"
                      value={editCollection}
                      onChange={(e) => setEditCollection(e.target.value)}
                      className="rounded-lg font-mono text-sm"
                      placeholder="LATE_MORNING"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="button" className="rounded-xl" disabled={savingDef} onClick={() => void saveDefinition()}>
                    <SaveIcon className="size-3.5" />
                    {savingDef ? 'Saving…' : 'Save definition'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {tab === 'sql' ? (
            <Card className="border-border/70 rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Source SQL</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Loaded from S3 via <code className="text-xs">GET /metrics/{'{id}'}/sql</code>. Saving uses{' '}
                  <code className="text-xs">POST</code> and may create a new version when the query changes.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {sqlLoading ? (
                  <Skeleton className="h-[min(48vh,520px)] w-full rounded-xl" />
                ) : (
                  <MonacoField language="sql" value={sqlDraft} onChange={setSqlDraft} showCopyButton />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" className="rounded-xl" disabled={savingSql || sqlLoading} onClick={() => void saveSql()}>
                    <SaveIcon className="size-3.5" />
                    {savingSql ? 'Saving…' : 'Save SQL'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    disabled={sqlLoading}
                    onClick={() => {
                      setSqlDraft(sqlBaseline)
                      setStatusMsg({ text: 'Reverted to last loaded SQL.' })
                    }}
                  >
                    Discard changes
                  </Button>
                  <Button type="button" variant="ghost" className="rounded-xl" onClick={() => void loadSql()}>
                    Reload from server
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : !error ? (
        <PageHeader title="Metric" description="Nothing to show." />
      ) : null}
    </div>
  )
}
