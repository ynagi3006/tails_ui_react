import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  ActivityIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  HeartIcon,
  FileCode2Icon,
  FileTextIcon,
  RefreshCwIcon,
  SaveIcon,
  Settings2Icon,
  TableIcon,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { MonacoField } from '@/components/monaco-field'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { IconHoverTip } from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { apiFetchJson, getClassicUiMetricUrl } from '@/lib/api'
import { buildDuplicateMetricLocationState, stashMetricDuplicateForNewPage } from '@/lib/new-metric-duplicate'
import { useMetricFavorites } from '@/hooks/use-metric-favorites'
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

const VIEWER_DATAPOINTS_LIMIT = 50

type DatapointDetailRow = {
  id: string
  value: number | null
  record_dttm: string
  created_at: string
  dimensions: Record<string, string>
  metadata: Record<string, string>
}

function formatJsonishValue(val: unknown): string {
  if (val == null) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  try {
    return JSON.stringify(val)
  } catch {
    return String(val)
  }
}

/** Normalizes API dimensions/metadata: JSON strings, snake/camel keys, nested values → string values. */
function parseKeyValueRecord(raw: unknown): Record<string, string> {
  if (raw == null) return {}
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return {}
    try {
      return parseKeyValueRecord(JSON.parse(t) as unknown)
    } catch {
      return {}
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, formatJsonishValue(v)]),
  )
}

function parseDatapointDetail(raw: Record<string, unknown>): DatapointDetailRow {
  const v = raw.value
  let value: number | null = null
  if (typeof v === 'number' && !Number.isNaN(v)) value = v
  else if (v != null && String(v).trim() !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) value = n
  }
  return {
    id: String(raw.id ?? ''),
    value,
    record_dttm: String(raw.record_dttm ?? raw.recordDttm ?? ''),
    created_at: String(raw.created_at ?? raw.createdAt ?? ''),
    dimensions: parseKeyValueRecord(raw.dimensions ?? raw.DIMENSIONS),
    metadata: parseKeyValueRecord(raw.metadata ?? raw.METADATA),
  }
}

function datapointValueLooksStructured(value: string): boolean {
  const t = value.trim()
  if (t.length > 100) return true
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) return true
  return t.includes('\n')
}

function DatapointValueCell({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  if (datapointValueLooksStructured(value)) {
    return (
      <pre
        className="bg-background/90 text-foreground border-border/60 max-h-32 max-w-full overflow-auto rounded-md border px-2 py-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all shadow-inner"
        tabIndex={0}
      >
        {value}
      </pre>
    )
  }
  return <span className="text-foreground text-[13px] leading-snug wrap-break-word">{value}</span>
}

function DatapointKvSection({ title, accent, entries }: { title: string; accent: string; entries: [string, string][] }) {
  if (entries.length === 0) return null
  return (
    <div
      className={cn(
        'border-border/50 bg-muted/25 rounded-lg border p-2.5 shadow-sm',
        'ring-1 ring-inset ring-black/3 dark:ring-white/4',
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', accent)} aria-hidden />
        <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">{title}</span>
        <span className="bg-border/80 h-px min-w-3 flex-1" aria-hidden />
        <span className="text-muted-foreground/80 font-mono text-[10px] tabular-nums">{entries.length}</span>
      </div>
      <ul className="space-y-2.5">
        {entries.map(([k, v]) => (
          <li key={k} className="list-none">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
              <Badge
                variant="secondary"
                className="text-muted-foreground w-fit shrink-0 rounded-md px-1.5 py-0 font-mono text-[10px] font-medium tracking-tight"
              >
                {k}
              </Badge>
              <div className="min-w-0 flex-1 pt-0 sm:pt-0.5">
                <DatapointValueCell value={v} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

type PageTab = 'overview' | 'definition' | 'sql' | 'airflow'

type AirflowLogRow = {
  dag_run_id: string
  dag_id: string
  status: string
  start_date: string | null
  end_date: string | null
  created_at: string
  error_message: string | null
}

function mapAirflowLog(raw: Record<string, unknown>): AirflowLogRow {
  return {
    dag_run_id: pickStr(raw, 'dag_run_id', 'dagRunId'),
    dag_id: pickStr(raw, 'dag_id', 'dagId'),
    status: pickStr(raw, 'status') || '—',
    start_date: pickStr(raw, 'start_date', 'startDate') || null,
    end_date: pickStr(raw, 'end_date', 'endDate') || null,
    created_at: pickStr(raw, 'created_at', 'createdAt'),
    error_message:
      raw.error_message != null && String(raw.error_message).trim()
        ? String(raw.error_message)
        : raw.errorMessage != null && String(raw.errorMessage).trim()
          ? String(raw.errorMessage)
          : null,
  }
}

function runTypeLabel(dagRunId: string): 'scheduled' | 'manual' | null {
  const s = dagRunId.toLowerCase()
  if (s.startsWith('scheduled')) return 'scheduled'
  if (s.startsWith('manual')) return 'manual'
  return null
}

function statusBadgeVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' {
  const s = status.toLowerCase()
  if (s === 'success' || s === 'succeeded') return 'success'
  if (s === 'failed' || s === 'error') return 'destructive'
  if (s === 'running' || s === 'queued' || s === 'pending') return 'outline'
  return 'secondary'
}

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
  const navigate = useNavigate()
  const { metricId = '' } = useParams<{ metricId: string }>()
  const { toggle: toggleMetricFavorite, has: hasMetricFavorite } = useMetricFavorites()
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

  const [airflowLogs, setAirflowLogs] = useState<AirflowLogRow[]>([])
  const [airflowLoading, setAirflowLoading] = useState(false)
  const [airflowError, setAirflowError] = useState<string | null>(null)

  const [duplicateNavigating, setDuplicateNavigating] = useState(false)
  const [datapointsViewerOpen, setDatapointsViewerOpen] = useState(false)
  const [viewerDatapoints, setViewerDatapoints] = useState<DatapointDetailRow[]>([])
  const [viewerDpLoading, setViewerDpLoading] = useState(false)
  const [viewerDpError, setViewerDpError] = useState<string | null>(null)

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

  useEffect(() => {
    setAirflowLogs([])
    setAirflowError(null)
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

  const loadAirflowLogs = useCallback(async () => {
    if (!mvid) return
    setAirflowLoading(true)
    setAirflowError(null)
    try {
      const sp = new URLSearchParams({
        metric_version_id: mvid,
        limit: '75',
      })
      const data = await apiFetchJson<unknown>(`/airflow/logs?${sp.toString()}`)
      const list = Array.isArray(data) ? data : []
      setAirflowLogs(list.map((row) => mapAirflowLog(row as Record<string, unknown>)))
    } catch (e) {
      setAirflowError(e instanceof Error ? e.message : 'Failed to load Airflow logs')
      setAirflowLogs([])
    } finally {
      setAirflowLoading(false)
    }
  }, [mvid])

  useEffect(() => {
    if (tab === 'airflow' && mvid) void loadAirflowLogs()
  }, [tab, mvid, loadAirflowLogs])

  const loadViewerDatapoints = useCallback(async () => {
    if (!mvid) return
    setViewerDpLoading(true)
    setViewerDpError(null)
    try {
      const sp = new URLSearchParams({
        limit: String(VIEWER_DATAPOINTS_LIMIT),
        skip: '0',
      })
      const data = await apiFetchJson<unknown>(
        `/metrics/${encodeURIComponent(mvid)}/datapoints?${sp.toString()}`,
      )
      const list = Array.isArray(data) ? data : []
      setViewerDatapoints(list.map((row) => parseDatapointDetail(row as Record<string, unknown>)))
    } catch (e) {
      setViewerDpError(e instanceof Error ? e.message : 'Failed to load datapoints')
      setViewerDatapoints([])
    } finally {
      setViewerDpLoading(false)
    }
  }, [mvid])

  const duplicateToNewMetric = useCallback(async () => {
    if (!metric || !metricId) return
    setDuplicateNavigating(true)
    try {
      let sql = ''
      try {
        const r = await apiFetchJson<{ sql: string }>(`/metrics/${encodeURIComponent(metricId)}/sql`)
        sql = r.sql ?? ''
      } catch {
        sql = ''
      }
      stashMetricDuplicateForNewPage(buildDuplicateMetricLocationState(metric as Record<string, unknown>, sql))
      void navigate('/metrics/new')
    } finally {
      setDuplicateNavigating(false)
    }
  }, [metric, metricId, navigate])

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
                  <IconHoverTip
                    title={hasMetricFavorite(metricId) ? 'Remove from favorites' : 'Add to favorites'}
                    caption={name}
                    side="bottom"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="rounded-xl"
                      aria-label={hasMetricFavorite(metricId) ? 'Remove from favorites' : 'Add to favorites'}
                      onClick={() => metricId && toggleMetricFavorite(metricId)}
                    >
                      <HeartIcon
                        className={cn('size-4', hasMetricFavorite(metricId) && 'fill-primary text-primary')}
                      />
                    </Button>
                  </IconHoverTip>
                  <IconHoverTip
                    title="Recent datapoints"
                    caption={`Inspect the last ${VIEWER_DATAPOINTS_LIMIT} values and timestamps in a table.`}
                    side="bottom"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="rounded-xl"
                      aria-label={`View ${VIEWER_DATAPOINTS_LIMIT} most recent datapoints`}
                      disabled={!mvid}
                      onClick={() => {
                        setDatapointsViewerOpen(true)
                        if (mvid) void loadViewerDatapoints()
                      }}
                    >
                      <DatabaseIcon className="size-4" />
                    </Button>
                  </IconHoverTip>
                  <IconHoverTip
                    title="Duplicate metric"
                    caption="New metric page opens with the same definition and SQL. Enter a new name there."
                    side="bottom"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      disabled={duplicateNavigating}
                      onClick={() => void duplicateToNewMetric()}
                    >
                      <CopyIcon className="mr-1.5 size-3.5" />
                      {duplicateNavigating ? 'Preparing…' : 'Duplicate'}
                    </Button>
                  </IconHoverTip>
                  <IconHoverTip title="Refresh" caption="Reload metric, latest value, and linked data from the API." side="bottom">
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => void load()}>
                      <RefreshCwIcon className="size-3.5" />
                      Refresh
                    </Button>
                  </IconHoverTip>
                  {classic ? (
                    <IconHoverTip title="Classic UI" caption="Open this metric in the legacy Tails web app in a new tab." side="bottom">
                      <Button size="sm" className="gap-1.5 rounded-xl" asChild>
                        <a href={classic} target="_blank" rel="noreferrer">
                          Classic UI
                          <ExternalLinkIcon className="size-3.5 opacity-80" />
                        </a>
                      </Button>
                    </IconHoverTip>
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
                ['airflow', 'Airflow runs', ActivityIcon],
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
            </div>
          ) : null}

          {tab === 'definition' ? (
            <Card className="border-border/70 rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Edit definition</CardTitle>
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

          {tab === 'airflow' ? (
            <Card className="border-border/70 rounded-2xl shadow-sm">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Airflow run logs</CardTitle>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-xl"
                  disabled={!mvid || airflowLoading}
                  onClick={() => void loadAirflowLogs()}
                >
                  <RefreshCwIcon className="size-3.5" />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {!mvid ? (
                  <p className="text-muted-foreground text-sm">No metric version id yet.</p>
                ) : airflowError ? (
                  <div
                    className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm"
                    role="alert"
                  >
                    {airflowError}
                  </div>
                ) : airflowLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-lg" />
                    ))}
                  </div>
                ) : airflowLogs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No Airflow runs logged yet.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[100px]">Status</TableHead>
                          <TableHead className="w-[100px]">Type</TableHead>
                          <TableHead className="min-w-[120px]">DAG</TableHead>
                          <TableHead className="min-w-[160px]">Run ID</TableHead>
                          <TableHead className="whitespace-nowrap">Started</TableHead>
                          <TableHead className="whitespace-nowrap">Ended</TableHead>
                          <TableHead className="whitespace-nowrap">Logged</TableHead>
                          <TableHead className="min-w-[200px]">Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {airflowLogs.map((log) => {
                          const rt = runTypeLabel(log.dag_run_id)
                          const err = log.error_message?.trim()
                          return (
                            <TableRow key={`${log.dag_run_id}-${log.created_at}`}>
                              <TableCell>
                                <Badge
                                  variant={statusBadgeVariant(log.status)}
                                  className="rounded-md font-normal capitalize"
                                >
                                  {log.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {rt ? (
                                  <Badge variant="outline" className="rounded-md font-normal capitalize">
                                    {rt}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{log.dag_id || '—'}</TableCell>
                              <TableCell>
                                <span className="font-mono text-xs break-all" title={log.dag_run_id}>
                                  {log.dag_run_id.length > 36 ? `${log.dag_run_id.slice(0, 34)}…` : log.dag_run_id}
                                </span>
                              </TableCell>
                              <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                                {log.start_date ? formatDate(log.start_date) : '—'}
                              </TableCell>
                              <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                                {log.end_date ? formatDate(log.end_date) : '—'}
                              </TableCell>
                              <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                                {log.created_at ? formatDate(log.created_at) : '—'}
                              </TableCell>
                              <TableCell className="max-w-[280px]">
                                {err ? (
                                  <span className="text-destructive text-xs leading-snug break-words" title={err}>
                                    {err.length > 120 ? `${err.slice(0, 118)}…` : err}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Dialog open={datapointsViewerOpen} onOpenChange={setDatapointsViewerOpen}>
            <DialogContent className="flex max-h-[min(85vh,760px)] w-full max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
              <DialogHeader className="border-border/60 shrink-0 space-y-0 border-b px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
                  <div className="space-y-1.5">
                    <DialogTitle className="flex items-center gap-2 text-lg">
                      <DatabaseIcon className="size-5 shrink-0 opacity-80" aria-hidden />
                      Recent datapoints
                    </DialogTitle>
                    <DialogDescription className="sr-only">Recent datapoints for this metric version.</DialogDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-lg"
                    disabled={viewerDpLoading || !mvid}
                    onClick={() => void loadViewerDatapoints()}
                  >
                    <RefreshCwIcon className="size-3.5" />
                    Refresh
                  </Button>
                </div>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
                {viewerDpError ? (
                  <div
                    className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm"
                    role="alert"
                  >
                    {viewerDpError}
                  </div>
                ) : viewerDpLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 w-full rounded-lg" />
                    ))}
                  </div>
                ) : viewerDatapoints.length === 0 ? (
                  <p className="text-muted-foreground text-sm leading-relaxed">No datapoints returned.</p>
                ) : (
                  <div className="rounded-xl border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[1%] whitespace-nowrap">Recorded</TableHead>
                          <TableHead className="w-[1%] whitespace-nowrap">Value</TableHead>
                          <TableHead className="min-w-[16rem] max-w-xl">Dimensions &amp; metadata</TableHead>
                          <TableHead className="w-[1%] whitespace-nowrap">Ingested</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewerDatapoints.map((dp, i) => {
                          const dimEntries = Object.entries(dp.dimensions)
                          const metaEntries = Object.entries(dp.metadata)
                          const hasAny = dimEntries.length > 0 || metaEntries.length > 0
                          return (
                            <TableRow key={dp.id || `dp-${i}-${dp.record_dttm}`}>
                              <TableCell className="text-muted-foreground whitespace-nowrap align-top text-xs">
                                {dp.record_dttm ? formatDate(dp.record_dttm) : '—'}
                              </TableCell>
                              <TableCell className="font-mono text-sm tabular-nums align-top">
                                {dp.value != null ? String(dp.value) : '—'}
                              </TableCell>
                              <TableCell className="max-w-[min(32rem,56vw)] align-top py-3">
                                {!hasAny ? (
                                  <span className="text-muted-foreground text-xs">—</span>
                                ) : (
                                  <div className="flex flex-col gap-2.5">
                                    <DatapointKvSection
                                      title="Dimensions"
                                      accent="bg-sky-500/90 dark:bg-sky-400/90"
                                      entries={dimEntries}
                                    />
                                    <DatapointKvSection
                                      title="Metadata"
                                      accent="bg-violet-500/90 dark:bg-violet-400/90"
                                      entries={metaEntries}
                                    />
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground whitespace-nowrap align-top text-xs">
                                {dp.created_at ? formatDate(dp.created_at) : '—'}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : !error ? (
        <PageHeader title="Metric" description="Nothing to show." />
      ) : null}
    </div>
  )
}
