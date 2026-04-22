import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ActivityIcon,
  ArrowLeftIcon,
  CopyIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  HeartIcon,
  FileCode2Icon,
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  Settings2Icon,
  Trash2Icon,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import { MonacoField } from '@/components/monaco-field'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useAirflowDagRunPoll } from '@/hooks/use-airflow-dag-run-poll'
import { apiFetchJson, getClassicUiMetricUrl } from '@/lib/api'
import { buildDuplicateMetricLocationState, stashMetricDuplicateForNewPage } from '@/lib/new-metric-duplicate'
import { pickAirflowTriggerFromMetricResponse, type AirflowTriggerPayload } from '@/lib/metric-airflow-trigger'
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
  airflow_trigger?: unknown
}

type MetricSqlPostResponse = {
  sql?: string
  airflow_trigger?: unknown
}

type PageTab = 'definition' | 'sql' | 'airflow'

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

type LocationAirflowState = {
  airflowTrigger?: AirflowTriggerPayload | null
}

export function MetricDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { metricId = '' } = useParams<{ metricId: string }>()
  const { toggle: toggleMetricFavorite, has: hasMetricFavorite } = useMetricFavorites()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [metric, setMetric] = useState<MetricDetail | null>(null)
  const [latest, setLatest] = useState<MetricLatest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<PageTab>('definition')

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

  /** When set, poll ``GET /airflow/runs/{id}`` after metric create or save (same as classic UI). */
  const [dagPollKeys, setDagPollKeys] = useState<{ dag_run_id: string; dag_id?: string } | null>(null)
  const consumedNavAirflow = useRef(false)
  const airflowPoll = useAirflowDagRunPoll(dagPollKeys?.dag_run_id, dagPollKeys?.dag_id)

  const [airflowLogs, setAirflowLogs] = useState<AirflowLogRow[]>([])
  const [airflowLoading, setAirflowLoading] = useState(false)
  const [airflowError, setAirflowError] = useState<string | null>(null)

  const [duplicateNavigating, setDuplicateNavigating] = useState(false)

  const load = useCallback(async () => {
    if (!metricId) return
    setLoading(true)
    setError(null)
    try {
      const m = await apiFetchJson<MetricDetail>(`/metrics/${encodeURIComponent(metricId)}`)
      setMetric(m)
      try {
        const withDp = await apiFetchJson<MetricLatest>(`/metrics/${encodeURIComponent(metricId)}/latest`)
        setLatest(withDp)
      } catch {
        setLatest(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metric')
      setMetric(null)
      setLatest(null)
    } finally {
      setLoading(false)
    }
  }, [metricId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    consumedNavAirflow.current = false
  }, [metricId])

  useEffect(() => {
    if (consumedNavAirflow.current) return
    const st = location.state as LocationAirflowState | null
    const tr = st?.airflowTrigger
    if (tr?.dag_run_id) {
      consumedNavAirflow.current = true
      setDagPollKeys({ dag_run_id: tr.dag_run_id, dag_id: tr.dag_id })
      navigate('.', { replace: true, state: {} })
    }
  }, [location.state, navigate])

  useEffect(() => {
    if (airflowPoll.terminalKind !== 'success') return
    const t = window.setTimeout(() => setDagPollKeys(null), 15_000)
    return () => window.clearTimeout(t)
  }, [airflowPoll.terminalKind])

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
      const trig = pickAirflowTriggerFromMetricResponse(res)
      if (trig?.dag_run_id) {
        setDagPollKeys({ dag_run_id: trig.dag_run_id, dag_id: trig.dag_id })
        setStatusMsg({ text: 'Metric definition saved. A collection run was triggered in Airflow.' })
      } else {
        const note = trig?.message && trig.status === 'skipped' ? ` ${trig.message}` : ''
        setStatusMsg({ text: `Metric definition saved.${note}` })
      }
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
      const res = await apiFetchJson<MetricSqlPostResponse>(`/metrics/${encodeURIComponent(metricId)}/sql`, {
        method: 'POST',
        body: JSON.stringify({ sql }),
      })
      const trig = pickAirflowTriggerFromMetricResponse(res)
      if (trig?.dag_run_id) {
        setDagPollKeys({ dag_run_id: trig.dag_run_id, dag_id: trig.dag_id })
        setStatusMsg({
          text: 'SQL saved. A new metric version was created and a collection run was triggered in Airflow.',
        })
      } else {
        setStatusMsg({
          text:
            trig?.status === 'skipped' && trig.message
              ? `SQL saved. ${trig.message}`
              : 'SQL saved. A new metric version may have been created if the query changed.',
        })
      }
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

  const deleteMetric = async () => {
    if (!metricId) return
    setDeleteBusy(true)
    setStatusMsg(null)
    try {
      await apiFetchJson(`/metrics/${encodeURIComponent(metricId)}`, { method: 'DELETE' })
      if (hasMetricFavorite(metricId)) toggleMetricFavorite(metricId)
      setDeleteOpen(false)
      setDagPollKeys(null)
      void navigate('/metrics')
    } catch (e) {
      setStatusMsg({ text: e instanceof Error ? e.message : 'Delete failed', error: true })
    } finally {
      setDeleteBusy(false)
    }
  }

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

      {dagPollKeys?.dag_run_id ? (
        <div
          className="border-primary/25 bg-primary/5 text-foreground rounded-2xl border px-4 py-3 shadow-sm"
          role="status"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">Metric collection (Airflow)</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {airflowPoll.isTerminal && airflowPoll.terminalKind === 'success'
                  ? 'Last triggered run finished successfully. This notice hides in a few seconds.'
                  : airflowPoll.isTerminal && airflowPoll.terminalKind === 'failed'
                    ? `Run failed${airflowPoll.snapshot?.state ? ` (${airflowPoll.snapshot.state})` : ''}. Check run logs for details.`
                    : airflowPoll.snapshot?.state
                      ? `Run state: ${airflowPoll.snapshot.state}. Still polling every 10s (same as the classic metrics UI).`
                      : 'Run queued or starting. Polling Airflow for status…'}
              </p>
              {airflowPoll.lastPollError ? (
                <p className="text-destructive text-xs">{airflowPoll.lastPollError}</p>
              ) : null}
              <p className="text-muted-foreground font-mono text-[10px] break-all opacity-80">
                {dagPollKeys.dag_run_id}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {airflowPoll.isPollingActive ? (
                <Loader2Icon className="text-primary size-5 animate-spin" aria-hidden />
              ) : null}
              <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setTab('airflow')}>
                Run logs
              </Button>
              <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={() => setDagPollKeys(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
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
              <div className="min-w-0 space-y-3">
                <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">Metric</p>
                <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
                <div className="max-w-2xl space-y-2">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Description</p>
                  <div className="border-border/50 bg-muted/15 rounded-xl border px-4 py-3 sm:px-5">
                    <p className="text-foreground text-sm leading-relaxed">
                      {pickStr(metric, 'description').trim() || '—'}
                    </p>
                  </div>
                </div>
                <dl className="text-foreground mt-1 grid max-w-2xl grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,7rem)_1fr] sm:gap-y-2.5">
                  <DefItem label="Created by">{createdByFromMetric(metric) || '—'}</DefItem>
                  <DefItem label="Connector">{pickStr(metric, 'source_connector') || '—'}</DefItem>
                  <DefItem label="Collection">
                    {pickStr(metric, 'collection_window')
                      ? pickStr(metric, 'collection_window').replace(/_/g, ' ')
                      : '—'}
                  </DefItem>
                  <DefItem label="Created at">
                    {pickStr(metric, 'created_at') ? formatDate(pickStr(metric, 'created_at')) : '—'}
                  </DefItem>
                </dl>
                <div className="flex flex-wrap gap-2 pt-0.5">
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
                    title="Datapoints"
                    caption="Open the full datapoint viewer with time range, paging, and filters."
                    side="bottom"
                  >
                    {metricId && mvid ? (
                      <Button type="button" variant="outline" size="icon" className="rounded-xl" asChild>
                        <Link to={`/metrics/${encodeURIComponent(metricId)}/datapoints`} aria-label="View datapoints">
                          <DatabaseIcon className="size-4" />
                        </Link>
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="icon" className="rounded-xl" disabled aria-label="View datapoints">
                        <DatabaseIcon className="size-4" />
                      </Button>
                    )}
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
                  <IconHoverTip title="Refresh" caption="Reload metric and latest value from the API." side="bottom">
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => void load()}>
                      <RefreshCwIcon className="size-3.5" />
                      Refresh
                    </Button>
                  </IconHoverTip>
                  <IconHoverTip
                    title="Delete metric"
                    caption="Removes this metric, every version, datapoints, and stored SQL. Cannot be undone."
                    side="bottom"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10 rounded-xl"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2Icon className="mr-1.5 size-3.5" />
                      Delete
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

          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent className="sm:max-w-md" showCloseButton={!deleteBusy}>
              <DialogHeader>
                <DialogTitle>Delete this metric?</DialogTitle>
                <DialogDescription>
                  <span className="text-foreground font-medium">{name}</span> and all of its versions, datapoints, and
                  warehouse SQL files will be permanently removed. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-lg" disabled={deleteBusy} onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-lg"
                  disabled={deleteBusy}
                  onClick={() => void deleteMetric()}
                >
                  {deleteBusy ? 'Deleting…' : 'Delete metric'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : !error ? (
        <PageHeader title="Metric" description="Nothing to show." />
      ) : null}
    </div>
  )
}
