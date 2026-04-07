import { useCallback, useEffect, useState } from 'react'
import { HeartIcon, SearchIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { CatalogLayoutToggle } from '@/components/catalog-layout-toggle'
import { CreateReportDialog } from '@/components/create-report-dialog'
import { DataTableCard } from '@/components/data-table-card'
import { PageHeader } from '@/components/page-header'
import { PaginationBar } from '@/components/pagination-bar'
import { ToolbarCard } from '@/components/toolbar-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { formatDate } from '@/lib/format-date'
import { useCatalogLayout } from '@/hooks/use-catalog-layout'
import { useReportFavorites } from '@/hooks/use-report-favorites'
import { parseSearchInput } from '@/lib/parse-search'
import { normalizeReportStatus, parseReportsResponse } from '@/lib/report-mapper'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20
const REPORTS_LAYOUT_KEY = 'tails_catalog_reports_layout'

type ReportRow = {
  id: string
  name: string
  description: string
  status: string
  tags: string[]
  created_at: string | null
}

function mapRow(r: Record<string, unknown>): ReportRow {
  return {
    id: String(r.id ?? ''),
    name: String(r.report_name ?? r.title ?? ''),
    description: String(r.description ?? ''),
    status: normalizeReportStatus(r.status),
    tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : [],
    created_at: (r.created_at as string | null | undefined) ?? null,
  }
}

export function ReportsPage() {
  const navigate = useNavigate()
  const { toggle, has } = useReportFavorites()
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [sortBy, setSortBy] = useState<'created_at' | 'name'>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)

  const [layout, setLayout] = useCatalogLayout(REPORTS_LAYOUT_KEY)

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
      if (status) params.set('status', status)
      if (search) params.set('search', search)
      tags.forEach((t) => params.append('tag', t))
      const data = await apiFetchJson<unknown>(`/reports?${params.toString()}`)
      const list = parseReportsResponse(data).map(mapRow)
      setRows(list)
      setHasNext(list.length === PAGE_SIZE)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports')
      setRows([])
      setHasNext(false)
    } finally {
      setLoading(false)
    }
  }, [appliedSearch, page, sortBy, sortOrder, status])

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

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catalog"
        title="All reports"
        actions={
          <CreateReportDialog
            onCreated={(id) => navigate(`/reports/${encodeURIComponent(id)}`)}
            trigger={
              <Button type="button" className="rounded-xl">
                New report
              </Button>
            }
          />
        }
      />

      <ToolbarCard>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Status</Label>
            <Select
              value={status || 'all'}
              onValueChange={(v) => {
                setStatus(v === 'all' ? '' : v)
                setPage(1)
              }}
            >
              <SelectTrigger size="sm" className="w-[168px] rounded-xl bg-background" aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
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
                <Skeleton key={i} className="h-52 rounded-2xl" />
              ))}
            </div>
          )
        ) : layout === 'list' ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60">
                  <TableHead className="text-muted-foreground w-12 px-2 font-medium">
                    <span className="sr-only">Favorite</span>
                  </TableHead>
                  <TableHead className="text-muted-foreground font-medium">
                    <Button variant="ghost" size="sm" className="-ml-2 h-8 rounded-lg font-medium" onClick={cycleNameSort}>
                      Name {sortBy === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </TableHead>
                  <TableHead className="text-muted-foreground font-medium">Status</TableHead>
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
                    <TableCell colSpan={5} className="text-muted-foreground py-16 text-center text-sm">
                      No reports match this query.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id} className="border-border/50">
                      <TableCell className="w-12 px-2 align-top">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-primary size-8 shrink-0 rounded-lg"
                          aria-label={has(r.id) ? 'Remove from favorites' : 'Add to favorites'}
                          onClick={() => r.id && toggle(r.id)}
                        >
                          <HeartIcon className={cn('size-4', has(r.id) && 'fill-primary text-primary')} />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          <Link to={`/reports/${encodeURIComponent(r.id)}`} className="hover:text-primary hover:underline">
                            {r.name}
                          </Link>
                        </div>
                        {r.description ? (
                          <div className="text-muted-foreground line-clamp-2 text-xs">{r.description}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {r.status.toLowerCase()}
                        </Badge>
                      </TableCell>
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
          <div className="text-muted-foreground p-10 text-center text-sm">No reports match this query.</div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => {
              const href = `/reports/${encodeURIComponent(r.id)}`
              return (
                <Card
                  key={r.id}
                  className="group border-border/70 from-card via-card to-muted/35 hover:border-primary/25 relative overflow-hidden rounded-2xl border bg-linear-to-br shadow-sm transition-[box-shadow,border-color] hover:shadow-md dark:via-card/95 dark:to-muted/25 dark:hover:to-muted/35"
                >
                  <Link
                    to={href}
                    className="ring-ring absolute inset-0 z-0 rounded-2xl focus-visible:ring-2 focus-visible:outline-none"
                    aria-label={`Open report: ${r.name}`}
                  />
                  <CardHeader className="pointer-events-none relative z-10 gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg leading-snug">
                        <span className="text-foreground group-hover:text-primary transition-colors">{r.name}</span>
                      </CardTitle>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-primary pointer-events-auto shrink-0 rounded-lg"
                        aria-label={has(r.id) ? 'Remove from favorites' : 'Add to favorites'}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (r.id) toggle(r.id)
                        }}
                      >
                        <HeartIcon className={cn('size-4', has(r.id) && 'fill-primary text-primary')} />
                      </Button>
                    </div>
                    <Badge variant="outline" className="w-fit rounded-md capitalize font-normal">
                      {r.status.toLowerCase()}
                    </Badge>
                    <div className="flex flex-wrap gap-1">
                      {r.tags.length
                        ? r.tags.map((t) => (
                            <Badge key={t} variant="secondary" className="font-normal">
                              {t}
                            </Badge>
                          ))
                        : null}
                    </div>
                    <p className="text-muted-foreground text-xs">{formatDate(r.created_at)}</p>
                  </CardHeader>
                  {r.description ? (
                    <CardContent className="pointer-events-none relative z-10 pt-0">
                      <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">{r.description}</p>
                    </CardContent>
                  ) : null}
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
