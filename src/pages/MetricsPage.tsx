import { useCallback, useEffect, useState } from 'react'
import { ExternalLinkIcon, SearchIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { CatalogLayoutToggle } from '@/components/catalog-layout-toggle'
import { CreateMetricDialog } from '@/components/create-metric-dialog'
import { DataTableCard } from '@/components/data-table-card'
import { PageHeader } from '@/components/page-header'
import { PaginationBar } from '@/components/pagination-bar'
import { ToolbarCard } from '@/components/toolbar-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
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
import { apiFetchJson, getClassicUiMetricsPageUrl } from '@/lib/api'
import { formatDate } from '@/lib/format-date'
import { useCatalogLayout } from '@/hooks/use-catalog-layout'
import { parseSearchInput } from '@/lib/parse-search'

const PAGE_SIZE = 20
const METRICS_LAYOUT_KEY = 'tails_catalog_metrics_layout'

type MetricRow = {
  id: string
  metric_version_id: string
  name: string
  unit: string
  tags: string[]
  created_at: string | null
  description: string
}

function parseMetricsResponse(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  return []
}

function mapMetric(r: Record<string, unknown>): MetricRow {
  const id = String(r.id ?? r.metric_id ?? '')
  return {
    id,
    metric_version_id: String(r.metric_version_id ?? ''),
    name: String(r.metric_name ?? r.name ?? ''),
    unit: String(r.default_metric_format ?? r.unit ?? '') || '—',
    tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : [],
    created_at: (r.created_at as string | null | undefined) ?? null,
    description: String(r.description ?? ''),
  }
}

export function MetricsPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [airflowFailedOnly, setAirflowFailedOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'created_at' | 'name'>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<MetricRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)

  const [layout, setLayout] = useCatalogLayout(METRICS_LAYOUT_KEY)

  const classicMetrics = getClassicUiMetricsPageUrl()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { search, tags } = parseSearchInput(appliedSearch)
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        skip: String((page - 1) * PAGE_SIZE),
        sort: sortBy,
        order: sortOrder,
      })
      if (search) params.set('search', search)
      tags.forEach((t) => params.append('tag', t))
      if (airflowFailedOnly) params.set('only_airflow_failed', 'true')
      const data = await apiFetchJson<unknown>(`/metrics?${params.toString()}`)
      const list = parseMetricsResponse(data).map(mapMetric)
      setRows(list)
      setHasNext(list.length === PAGE_SIZE)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics')
      setRows([])
      setHasNext(false)
    } finally {
      setLoading(false)
    }
  }, [airflowFailedOnly, appliedSearch, page, sortBy, sortOrder])

  useEffect(() => {
    void load()
  }, [load])

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setAppliedSearch(searchInput)
    setPage(1)
  }

  const cycleNameSort = () => {
    if (sortBy !== 'name') {
      setSortBy('name')
      setSortOrder('asc')
    } else {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    }
    setPage(1)
  }

  const cycleCreatedSort = () => {
    if (sortBy !== 'created_at') {
      setSortBy('created_at')
      setSortOrder('desc')
    } else {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    }
    setPage(1)
  }

  const clearFilters = () => {
    setAirflowFailedOnly(false)
    setSearchInput('')
    setAppliedSearch('')
    setPage(1)
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Definitions"
        title="Metrics"
        actions={
          <div className="flex flex-wrap gap-2">
            <CreateMetricDialog
              onCreated={(id) => navigate(`/metrics/${encodeURIComponent(id)}`)}
              trigger={
                <Button type="button" size="sm" className="rounded-xl">
                  New metric
                </Button>
              }
            />
            {classicMetrics ? (
              <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" asChild>
                <a href={classicMetrics} target="_blank" rel="noreferrer" className="inline-flex items-center">
                  Classic list
                  <ExternalLinkIcon className="size-3.5 opacity-80" />
                </a>
              </Button>
            ) : null}
          </div>
        }
      />

      <ToolbarCard>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Airflow</Label>
              <Select
                value={airflowFailedOnly ? 'failed' : 'all'}
                onValueChange={(v) => {
                  setAirflowFailedOnly(v === 'failed')
                  setPage(1)
                }}
              >
                <SelectTrigger size="sm" className="w-[180px] rounded-xl bg-background" aria-label="Filter by Airflow outcome">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All metrics</SelectItem>
                  <SelectItem value="failed">Failed run only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={clearFilters}>
              Reset
            </Button>
          </div>
          <CatalogLayoutToggle value={layout} onChange={setLayout} />
        </div>
        <form onSubmit={onSearchSubmit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              className="rounded-xl pl-9"
              placeholder="Name or #tags…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" className="rounded-xl sm:w-auto">
            Search
          </Button>
        </form>
      </ToolbarCard>

      {error ? (
        <div
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-2xl border px-4 py-3 text-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <DataTableCard>
        {loading ? (
          layout === 'list' ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))}
            </div>
          )
        ) : layout === 'list' ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60">
                  <TableHead className="text-muted-foreground font-medium">
                    <Button variant="ghost" size="sm" className="-ml-2 h-8 rounded-lg font-medium" onClick={cycleNameSort}>
                      Name {sortBy === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </TableHead>
                  <TableHead className="text-muted-foreground font-medium">Unit</TableHead>
                  <TableHead className="text-muted-foreground font-medium">Tags</TableHead>
                  <TableHead className="text-muted-foreground font-medium">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8 rounded-lg font-medium"
                      onClick={cycleCreatedSort}
                    >
                      Created {sortBy === 'created_at' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground py-16 text-center text-sm">
                      No metrics match this query.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.metric_version_id || r.id} className="border-border/50">
                      <TableCell>
                        <div className="font-medium">
                          <Link to={`/metrics/${encodeURIComponent(r.id)}`} className="hover:text-primary hover:underline">
                            {r.name}
                          </Link>
                        </div>
                        {r.description ? (
                          <div className="text-muted-foreground line-clamp-2 text-xs">{r.description}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.unit}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.tags.length
                            ? r.tags.map((t) => (
                                <Badge key={t} variant="secondary" className="font-normal">
                                  {t}
                                </Badge>
                              ))
                            : '—'}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                        {formatDate(r.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-muted-foreground p-10 text-center text-sm">No metrics match this query.</div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => {
              const href = `/metrics/${encodeURIComponent(r.id)}`
              return (
                <Card
                  key={r.metric_version_id || r.id}
                  className="group border-border/70 from-card via-card to-muted/35 hover:border-primary/25 relative overflow-hidden rounded-2xl border bg-linear-to-br shadow-sm transition-[box-shadow,border-color] hover:shadow-md dark:via-card/95 dark:to-muted/25 dark:hover:to-muted/35"
                >
                  <Link
                    to={href}
                    className="ring-ring absolute inset-0 z-0 rounded-2xl focus-visible:ring-2 focus-visible:outline-none"
                    aria-label={`Open metric: ${r.name}`}
                  />
                  <CardHeader className="pointer-events-none relative z-10 gap-2">
                    <CardTitle className="text-lg leading-snug">
                      <span className="text-foreground group-hover:text-primary transition-colors">{r.name}</span>
                    </CardTitle>
                    {r.description ? (
                      <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed">{r.description}</p>
                    ) : null}
                    <Badge variant="secondary" className="w-fit rounded-md font-normal">
                      {r.unit}
                    </Badge>
                    <div className="flex flex-wrap gap-1">
                      {r.tags.length
                        ? r.tags.map((t) => (
                            <Badge key={t} variant="outline" className="font-normal">
                              {t}
                            </Badge>
                          ))
                        : null}
                    </div>
                    <p className="text-muted-foreground text-xs">{formatDate(r.created_at)}</p>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        )}
      </DataTableCard>

      {!loading && rows.length > 0 ? (
        <PaginationBar
          page={page}
          hasNextPage={hasNext}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          onJump={(p) => setPage(p)}
        />
      ) : null}
    </div>
  )
}
