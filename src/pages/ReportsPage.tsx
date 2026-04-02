import { useCallback, useEffect, useState } from 'react'
import { ExternalLinkIcon, SearchIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { CreateReportDialog } from '@/components/create-report-dialog'
import { DataTableCard } from '@/components/data-table-card'
import { PageHeader } from '@/components/page-header'
import { PaginationBar } from '@/components/pagination-bar'
import { ToolbarCard } from '@/components/toolbar-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { apiFetchJson, getClassicUiReportUrl } from '@/lib/api'
import { formatDate } from '@/lib/format-date'
import { parseSearchInput } from '@/lib/parse-search'
import { normalizeReportStatus, parseReportsResponse } from '@/lib/report-mapper'

const PAGE_SIZE = 20

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
        description="View rendered HTML in-app, or open the classic UI to edit templates."
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
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border/60">
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
                <TableHead className="text-right text-muted-foreground font-medium">Actions</TableHead>
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
                rows.map((r) => {
                  const classic = getClassicUiReportUrl(r.id)
                  return (
                    <TableRow key={r.id} className="border-border/50">
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
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2" asChild>
                            <Link to={`/reports/${encodeURIComponent(r.id)}`}>View</Link>
                          </Button>
                          {classic ? (
                            <Button variant="ghost" size="sm" className="text-muted-foreground h-8 gap-1 rounded-lg px-2" asChild>
                              <a href={classic} target="_blank" rel="noreferrer" title="Edit in classic UI">
                                <span className="sr-only">Classic UI</span>
                                <ExternalLinkIcon className="size-3.5" />
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
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
