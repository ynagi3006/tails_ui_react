import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FilterIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiFetchJson } from '@/lib/api'
import { type DatapointDetailRow, parseDatapointDetail } from '@/lib/metric-datapoint-detail'
import { formatDate } from '@/lib/format-date'
import { metricNameFromRow, metricVersionIdFromRow } from '@/lib/parse-metric-response'
type MetricDetail = Record<string, unknown>

const PAGE_LIMIT_OPTIONS = [50, 100, 200, 500, 1000] as const

function formatForDatetimeLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

function isoFromDatetimeLocalValue(local: string): string | null {
  const t = local.trim()
  if (!t) return null
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

type AttrTarget = 'dimension' | 'metadata'

type AttrFilterRule = {
  id: string
  target: AttrTarget
  key: string
  value: string
  mode: 'equals' | 'contains'
}

function newAttrFilterRule(target: AttrTarget): AttrFilterRule {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `f-${Date.now()}-${Math.random()}`,
    target,
    key: '',
    value: '',
    mode: 'equals',
  }
}

/** Resolve dimension/metadata value by case-insensitive key match (same idea as template `where_dimension`). */
function valueForKeyInsensitive(record: Record<string, string>, userKey: string): string | undefined {
  const want = userKey.trim()
  if (!want) return undefined
  const low = want.toLowerCase()
  for (const [k, v] of Object.entries(record)) {
    if (k.toLowerCase() === low) return v
  }
  return undefined
}

function ruleIsActive(rule: AttrFilterRule): boolean {
  return rule.key.trim().length > 0 && rule.value.trim().length > 0
}

function rowMatchesAttrRule(dp: DatapointDetailRow, rule: AttrFilterRule): boolean {
  if (!ruleIsActive(rule)) return true
  const record = rule.target === 'dimension' ? dp.dimensions : dp.metadata
  const actual = valueForKeyInsensitive(record, rule.key)
  if (actual === undefined) return false
  const needle = rule.value.trim()
  if (rule.mode === 'equals') {
    return actual.trim().toLowerCase() === needle.toLowerCase()
  }
  return actual.toLowerCase().includes(needle.toLowerCase())
}

function rowMatchesAllAttrRules(dp: DatapointDetailRow, rules: AttrFilterRule[]): boolean {
  for (const r of rules) {
    if (!rowMatchesAttrRule(dp, r)) return false
  }
  return true
}

/** Column keys for a flat “worksheet” grid (sorted for stable column order). */
function collectColumnKeys(rows: DatapointDetailRow[]): { dimKeys: string[]; metaKeys: string[] } {
  const dim = new Set<string>()
  const meta = new Set<string>()
  for (const dp of rows) {
    for (const k of Object.keys(dp.dimensions)) dim.add(k)
    for (const k of Object.keys(dp.metadata)) meta.add(k)
  }
  return {
    dimKeys: [...dim].sort((a, b) => a.localeCompare(b)),
    metaKeys: [...meta].sort((a, b) => a.localeCompare(b)),
  }
}

function cellDisplay(value: string | undefined): { text: string; title?: string } {
  const raw = value?.trim() ?? ''
  if (!raw) return { text: '' }
  const singleLine = raw.replace(/\s+/g, ' ')
  const maxLen = 2000
  const truncated = singleLine.length > maxLen ? `${singleLine.slice(0, maxLen)}…` : singleLine
  return { text: truncated, title: singleLine.length > 80 || raw.includes('\n') ? singleLine : undefined }
}

export function MetricDatapointsPage() {
  const { metricId } = useParams<{ metricId: string }>()
  const [metric, setMetric] = useState<MetricDetail | null>(null)
  const [loadMetricError, setLoadMetricError] = useState<string | null>(null)
  const [metricLoading, setMetricLoading] = useState(true)

  const [startLocal, setStartLocal] = useState('')
  const [endLocal, setEndLocal] = useState('')
  const [limit, setLimit] = useState<number>(100)
  const [skip, setSkip] = useState(0)

  const [rows, setRows] = useState<DatapointDetailRow[]>([])
  const [dpLoading, setDpLoading] = useState(false)
  const [dpError, setDpError] = useState<string | null>(null)

  const [attrRulesDraft, setAttrRulesDraft] = useState<AttrFilterRule[]>([])
  const [attrRulesApplied, setAttrRulesApplied] = useState<AttrFilterRule[]>([])

  const loadMetric = useCallback(async () => {
    if (!metricId) return
    setMetricLoading(true)
    setLoadMetricError(null)
    try {
      const m = await apiFetchJson<MetricDetail>(`/metrics/${encodeURIComponent(metricId)}`)
      setMetric(m)
    } catch (e) {
      setLoadMetricError(e instanceof Error ? e.message : 'Failed to load metric')
      setMetric(null)
    } finally {
      setMetricLoading(false)
    }
  }, [metricId])

  useEffect(() => {
    void loadMetric()
  }, [loadMetric])

  const mvid = metric ? metricVersionIdFromRow(metric) : ''
  const name = metric ? metricNameFromRow(metric) : ''

  /** Seed default window when metric id changes. */
  useEffect(() => {
    if (!metricId) return
    const end = new Date()
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
    setStartLocal(formatForDatetimeLocal(start))
    setEndLocal(formatForDatetimeLocal(end))
    setSkip(0)
    setAttrRulesDraft([])
    setAttrRulesApplied([])
  }, [metricId])

  const fetchDatapoints = useCallback(async () => {
    if (!mvid) return
    setDpLoading(true)
    setDpError(null)
    try {
      const sp = new URLSearchParams({
        limit: String(limit),
        skip: String(skip),
      })
      const startIso = isoFromDatetimeLocalValue(startLocal)
      const endIso = isoFromDatetimeLocalValue(endLocal)
      if (startIso) sp.set('start_time', startIso)
      if (endIso) sp.set('end_time', endIso)
      const data = await apiFetchJson<unknown>(`/metrics/${encodeURIComponent(mvid)}/datapoints?${sp.toString()}`)
      const list = Array.isArray(data) ? data : []
      setRows(list.map((row) => parseDatapointDetail(row as Record<string, unknown>)))
    } catch (e) {
      setDpError(e instanceof Error ? e.message : 'Failed to load datapoints')
      setRows([])
    } finally {
      setDpLoading(false)
    }
  }, [mvid, limit, skip, startLocal, endLocal])

  useEffect(() => {
    if (!mvid) return
    void fetchDatapoints()
  }, [mvid, fetchDatapoints])

  const filteredRows = useMemo(() => {
    return rows.filter((dp) => rowMatchesAllAttrRules(dp, attrRulesApplied))
  }, [rows, attrRulesApplied])

  const { dimKeys, metaKeys } = useMemo(() => collectColumnKeys(rows), [rows])

  const applyRefineFilters = useCallback(() => {
    setAttrRulesApplied(attrRulesDraft.map((r) => ({ ...r })))
    void fetchDatapoints()
  }, [attrRulesDraft, fetchDatapoints])

  const canGoNext = rows.length === limit
  const canGoPrev = skip > 0

  const applyPreset = (days: number | 'all') => {
    if (days === 'all') {
      setStartLocal('')
      setEndLocal('')
    } else {
      const end = new Date()
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
      setStartLocal(formatForDatetimeLocal(start))
      setEndLocal(formatForDatetimeLocal(end))
    }
    setSkip(0)
  }

  const pageStart = skip + 1
  const pageEnd = skip + rows.length

  if (!metricId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Datapoints" description="Missing metric id." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-10 pt-4 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Button variant="ghost" size="sm" className="text-muted-foreground -ml-2 h-8 gap-1 rounded-lg px-2" asChild>
            <Link to={`/metrics/${encodeURIComponent(metricId)}`}>
              <ArrowLeftIcon className="size-3.5" />
              Back to metric
            </Link>
          </Button>
          {metricLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-64 rounded-lg" />
              <Skeleton className="h-4 w-96 max-w-full rounded-lg" />
            </div>
          ) : loadMetricError ? (
            <PageHeader title="Datapoints" description={loadMetricError} />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <DatabaseIcon className="text-muted-foreground size-6 shrink-0" aria-hidden />
              <h1 className="text-foreground text-2xl font-semibold tracking-tight">Datapoints</h1>
              {name ? (
                <Badge variant="secondary" className="max-w-[min(100%,28rem)] truncate font-normal">
                  {name}
                </Badge>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={dpLoading || !mvid}
            onClick={() => void fetchDatapoints()}
          >
            {dpLoading ? <Loader2Icon className="size-3.5 animate-spin" /> : <RefreshCwIcon className="size-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {!metricLoading && !loadMetricError && metric ? (
        <>
          <Card className="border-border/70 overflow-hidden rounded-2xl shadow-sm">
            <CardHeader className="border-border/60 bg-muted/20 border-b pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <FilterIcon className="text-muted-foreground size-4" aria-hidden />
                <CardTitle className="text-base">Time range &amp; paging</CardTitle>
              </div>
              <CardDescription>
                Presets set <span className="text-foreground/90 font-medium">record time</span> bounds sent to the API.
                Pagination uses <code className="text-foreground/80 text-xs">skip</code> /{' '}
                <code className="text-foreground/80 text-xs">limit</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    [7, 'Last 7 days'],
                    [30, 'Last 30 days'],
                    [90, 'Last 90 days'],
                  ] as const
                ).map(([d, label]) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="rounded-full"
                    onClick={() => applyPreset(d)}
                  >
                    {label}
                  </Button>
                ))}
                <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => applyPreset('all')}>
                  All time
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="dp-start">From (record time)</Label>
                  <Input
                    id="dp-start"
                    type="datetime-local"
                    value={startLocal}
                    onChange={(e) => {
                      setStartLocal(e.target.value)
                      setSkip(0)
                    }}
                    className="rounded-lg font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dp-end">To (record time)</Label>
                  <Input
                    id="dp-end"
                    type="datetime-local"
                    value={endLocal}
                    onChange={(e) => {
                      setEndLocal(e.target.value)
                      setSkip(0)
                    }}
                    className="rounded-lg font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Page size</Label>
                  <Select
                    value={String(limit)}
                    onValueChange={(v) => {
                      setLimit(Number(v))
                      setSkip(0)
                    }}
                  >
                    <SelectTrigger className="rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_LIMIT_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} rows
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <p className="text-muted-foreground text-xs leading-snug">
                    API returns newest first. Adjust the window, then use Prev / Next to walk through history.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <FilterIcon className="text-muted-foreground size-4" aria-hidden />
                <CardTitle className="text-base">Refine your Data</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!mvid || dpLoading) return
                  applyRefineFilters()
                }}
              >
                <div className="border-border/80 space-y-3 rounded-lg border bg-muted/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-foreground text-sm font-medium">Dimension &amp; metadata filters</span>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 rounded-lg"
                        onClick={() => setAttrRulesDraft((prev) => [...prev, newAttrFilterRule('dimension')])}
                      >
                        <PlusIcon className="size-3.5 shrink-0" />
                        Dimension
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 rounded-lg"
                        onClick={() => setAttrRulesDraft((prev) => [...prev, newAttrFilterRule('metadata')])}
                      >
                        <PlusIcon className="size-3.5 shrink-0" />
                        Metadata
                      </Button>
                    </div>
                  </div>
                  <p className="text-muted-foreground text-xs leading-snug">
                    Key matches case-insensitively (e.g. <span className="font-mono">SITE</span> matches{' '}
                    <span className="font-mono">site</span>). Equals / contains apply to that field&apos;s value. Rows
                    missing the key are excluded when the rule has both key and value.
                  </p>
                  {attrRulesDraft.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No attribute rules. Add one to require e.g. SITE = Network.</p>
                  ) : (
                    <ul className="space-y-2">
                      {attrRulesDraft.map((rule, idx) => (
                        <li
                          key={rule.id}
                          className="border-border/70 bg-background flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:flex-wrap sm:items-end"
                        >
                          <div className="space-y-1 sm:w-[7rem]">
                            <Label className="text-xs">Target</Label>
                            <Select
                              value={rule.target}
                              onValueChange={(v) =>
                                setAttrRulesDraft((prev) =>
                                  prev.map((r) => (r.id === rule.id ? { ...r, target: v as AttrTarget } : r)),
                                )
                              }
                            >
                              <SelectTrigger className="h-9 rounded-md font-mono text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="dimension">Dimension</SelectItem>
                                <SelectItem value="metadata">Metadata</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="min-w-0 flex-1 space-y-1 sm:max-w-[10rem]">
                            <Label className="text-xs">Key</Label>
                            <Input
                              value={rule.key}
                              onChange={(e) =>
                                setAttrRulesDraft((prev) =>
                                  prev.map((r) => (r.id === rule.id ? { ...r, key: e.target.value } : r)),
                                )
                              }
                              placeholder="SITE"
                              className="h-9 rounded-md font-mono text-xs"
                              aria-label={`Rule ${idx + 1} key`}
                            />
                          </div>
                          <div className="min-w-0 flex-[2] space-y-1 sm:min-w-[8rem]">
                            <Label className="text-xs">Value</Label>
                            <Input
                              value={rule.value}
                              onChange={(e) =>
                                setAttrRulesDraft((prev) =>
                                  prev.map((r) => (r.id === rule.id ? { ...r, value: e.target.value } : r)),
                                )
                              }
                              placeholder="Network"
                              className="h-9 rounded-md font-mono text-xs"
                              aria-label={`Rule ${idx + 1} value`}
                            />
                          </div>
                          <div className="space-y-1 sm:w-[8.5rem]">
                            <Label className="text-xs">Match</Label>
                            <Select
                              value={rule.mode}
                              onValueChange={(v) =>
                                setAttrRulesDraft((prev) =>
                                  prev.map((r) => (r.id === rule.id ? { ...r, mode: v as 'equals' | 'contains' } : r)),
                                )
                              }
                            >
                              <SelectTrigger className="h-9 rounded-md text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="equals">Equals</SelectItem>
                                <SelectItem value="contains">Contains</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive h-9 w-9 shrink-0 self-end sm:self-end"
                            aria-label={`Remove rule ${idx + 1}`}
                            onClick={() => setAttrRulesDraft((prev) => prev.filter((r) => r.id !== rule.id))}
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" className="gap-2 rounded-xl" disabled={!mvid || dpLoading}>
                    {dpLoading ? (
                      <>
                        <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      <>
                        <RefreshCwIcon className="size-3.5 shrink-0" />
                        Apply and refresh
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border-border/70 rounded-2xl shadow-sm">
            <CardHeader className="border-border/60 flex flex-col gap-3 border-b sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Results</CardTitle>
                <CardDescription className="mt-1">
                  Showing{' '}
                  <span className="text-foreground font-medium tabular-nums">
                    {filteredRows.length === rows.length
                      ? rows.length
                      : `${filteredRows.length} filtered / ${rows.length} loaded`}
                  </span>
                  {rows.length > 0 ? (
                    <>
                      {' '}
                      · server slice{' '}
                      <span className="tabular-nums">
                        {pageStart}–{pageEnd}
                      </span>
                    </>
                  ) : null}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  disabled={!canGoPrev || dpLoading}
                  onClick={() => setSkip((s) => Math.max(0, s - limit))}
                >
                  <ChevronLeftIcon className="size-4" />
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  disabled={!canGoNext || dpLoading}
                  onClick={() => setSkip((s) => s + limit)}
                >
                  Next
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {dpError ? (
                <div
                  className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm"
                  role="alert"
                >
                  {dpError}
                </div>
              ) : dpLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              ) : filteredRows.length === 0 ? (
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {rows.length === 0
                    ? 'No datapoints in this window. Try widening the time range, increasing page size, or moving to the next page.'
                    : 'No rows match your filters. Clear refine rules or change the time window.'}
                </p>
              ) : (
                <div className="border-border rounded-md border bg-background">
                  <Table
                    className={[
                      'w-max min-w-full border-collapse text-xs',
                      '[&_th]:border-border [&_th]:border [&_th]:bg-muted/90 [&_th]:px-2.5 [&_th]:py-2 [&_th]:font-mono [&_th]:font-normal [&_th]:text-foreground',
                      '[&_td]:border-border [&_td]:border [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:font-mono [&_td]:align-top',
                    ].join(' ')}
                  >
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="border-border sticky left-0 z-20 min-w-[9rem] border border-r bg-muted/90">
                          RECORD_DTTM
                        </TableHead>
                        <TableHead className="min-w-[6rem]">VALUE</TableHead>
                        {dimKeys.map((k) => (
                          <TableHead key={`d:${k}`} className="min-w-[8rem] max-w-[20rem]">
                            {k}
                          </TableHead>
                        ))}
                        {metaKeys.map((k) => (
                          <TableHead key={`m:${k}`} className="min-w-[8rem] max-w-[20rem] text-muted-foreground">
                            METADATA_{k}
                          </TableHead>
                        ))}
                        <TableHead className="min-w-[9rem]">CREATED_AT</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((dp, i) => (
                        <TableRow key={dp.id || `dp-${i}-${dp.record_dttm}`} className="group bg-background hover:bg-muted/20">
                          <TableCell className="text-muted-foreground sticky left-0 z-10 whitespace-nowrap border-r border-border bg-background group-hover:bg-muted/20">
                            {dp.record_dttm ? formatDate(dp.record_dttm) : ''}
                          </TableCell>
                          <TableCell className="tabular-nums text-foreground">{dp.value != null ? String(dp.value) : ''}</TableCell>
                          {dimKeys.map((k) => {
                            const { text, title } = cellDisplay(dp.dimensions[k])
                            return (
                              <TableCell
                                key={`d:${k}`}
                                className="max-w-[20rem] whitespace-normal break-all text-foreground"
                                title={title}
                              >
                                {text}
                              </TableCell>
                            )
                          })}
                          {metaKeys.map((k) => {
                            const { text, title } = cellDisplay(dp.metadata[k])
                            return (
                              <TableCell
                                key={`m:${k}`}
                                className="max-w-[20rem] whitespace-normal break-all text-muted-foreground"
                                title={title}
                              >
                                {text}
                              </TableCell>
                            )
                          })}
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {dp.created_at ? formatDate(dp.created_at) : ''}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
