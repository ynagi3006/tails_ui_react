import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownAZIcon,
  ArrowDownWideNarrowIcon,
  CalendarDaysIcon,
  ExternalLinkIcon,
  HeartIcon,
  SearchIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

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
import { apiFetchJson, getClassicUiReportUrl } from '@/lib/api'
import { parseSearchInput } from '@/lib/parse-search'
import { mapApiReportToCard, parseReportsResponse, type ReportCardModel } from '@/lib/report-mapper'
import { useReportFavorites } from '@/hooks/use-report-favorites'
import { formatDate, formatDateOnly } from '@/lib/format-date'
import { cn } from '@/lib/utils'

const HOME_PAGE_SIZE = 12
const SORT_CREATED = 'created_at'
const SORT_NAME = 'name'

function buildReportsQuery(params: {
  page: number
  sort: string
  order: string
  search: string
  tags: string[]
  reportIds?: string[]
}) {
  const sp = new URLSearchParams({
    limit: String(HOME_PAGE_SIZE),
    skip: String((params.page - 1) * HOME_PAGE_SIZE),
    sort: params.sort,
    order: params.order,
    status: 'published',
  })
  if (params.search) sp.set('search', params.search)
  params.tags.forEach((t) => sp.append('tag', t))
  if (params.reportIds?.length) sp.set('report_ids', params.reportIds.join(','))
  return sp.toString()
}

export function HomePage() {
  const { ids: favoriteIds, count: favoriteCount, toggle, has } = useReportFavorites()

  const [searchInput, setSearchInput] = useState('')
  /** Committed on Search submit (avoids refetch on every keystroke). */
  const [appliedSearch, setAppliedSearch] = useState('')
  const [availability, setAvailability] = useState<'available' | 'favorited'>('available')
  const [sortBy, setSortBy] = useState(SORT_CREATED)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<ReportCardModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasNextPage, setHasNextPage] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { search, tags } = parseSearchInput(appliedSearch)
      const favList = Array.from(favoriteIds)
      if (availability === 'favorited' && favList.length === 0) {
        setRows([])
        setHasNextPage(false)
        setLoading(false)
        return
      }
      const qs = buildReportsQuery({
        page,
        sort: sortBy,
        order: sortOrder,
        search,
        tags,
        reportIds: availability === 'favorited' ? favList : undefined,
      })
      const data = await apiFetchJson<unknown>(`/reports?${qs}`)
      const list = parseReportsResponse(data)
      setRows(list.map((r) => mapApiReportToCard(r)))
      setHasNextPage(list.length === HOME_PAGE_SIZE)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports')
      setRows([])
      setHasNextPage(false)
    } finally {
      setLoading(false)
    }
  }, [appliedSearch, availability, favoriteIds, page, sortBy, sortOrder])

  useEffect(() => {
    void load()
  }, [load])

  const toggleSortOrder = () => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setAppliedSearch(searchInput)
    setPage(1)
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Library"
        title="Reports"
        actions={
          favoriteCount > 0 ? (
            <div
              className="flex items-center gap-2.5"
              role="status"
              aria-label={`Favorite Reports: ${favoriteCount} saved`}
            >
              <div className="border-border/70 bg-card/80 text-card-foreground flex size-11 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm">
                <span className="text-foreground text-sm font-semibold tabular-nums leading-none">
                  {favoriteCount}
                </span>
              </div>
              <span className="text-foreground text-sm font-medium leading-snug whitespace-nowrap">
                Favorite Reports
              </span>
            </div>
          ) : undefined
        }
      />

      <section className="space-y-5">
        <ToolbarCard>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">View</Label>
              <Select
                value={availability}
                onValueChange={(v) => {
                  setAvailability(v as 'available' | 'favorited')
                  setPage(1)
                }}
              >
                <SelectTrigger size="sm" className="w-[148px] rounded-xl bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="favorited">Favorited</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Sort</Label>
              <div className="flex items-center gap-1.5">
                <Select
                  value={sortBy}
                  onValueChange={(v) => {
                    setSortBy(v)
                    setPage(1)
                  }}
                >
                  <SelectTrigger size="sm" className="w-[148px] rounded-xl bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value={SORT_CREATED}>Created date</SelectItem>
                    <SelectItem value={SORT_NAME}>Name</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-8 shrink-0 rounded-xl"
                  onClick={toggleSortOrder}
                  aria-label="Toggle sort order"
                >
                  {sortOrder === 'desc' ? (
                    <ArrowDownWideNarrowIcon className="size-4" />
                  ) : (
                    <ArrowDownAZIcon className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <form onSubmit={onSearchSubmit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                className="rounded-xl pl-9"
                placeholder="Name or #tag1, tag2…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Search reports"
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

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Card className="border-border/60 from-card via-muted/20 to-muted/40 rounded-2xl border-dashed bg-linear-to-br shadow-none dark:via-muted/10 dark:to-muted/25">
            <CardContent className="text-muted-foreground py-14 text-center text-sm">
              {availability === 'favorited' && favoriteIds.size === 0
                ? 'Star reports to collect them here.'
                : 'Nothing matches. Try clearing search or tags.'}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r, i) => {
              const classic = getClassicUiReportUrl(r.id)
              const favorited = has(r.id)
              const reportHref = `/reports/${encodeURIComponent(r.id)}`
              return (
                <Card
                  key={r.id || i}
                  className="group border-border/70 from-card via-card to-muted/35 hover:border-primary/25 relative cursor-pointer overflow-hidden rounded-2xl border bg-linear-to-br shadow-sm transition-[box-shadow,border-color] hover:shadow-md dark:via-card/95 dark:to-muted/25 dark:hover:to-muted/35"
                >
                  <Link
                    to={reportHref}
                    className="ring-ring absolute inset-0 z-0 rounded-2xl focus-visible:ring-2 focus-visible:outline-none"
                    aria-label={`Open report: ${r.title}`}
                  />
                  <CardHeader className="pointer-events-none relative z-10 gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="flex flex-col items-start gap-1 text-lg leading-snug">
                        <span className="text-foreground group-hover:text-primary transition-colors">{r.title}</span>
                        {classic ? (
                          <a
                            href={classic}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground pointer-events-auto inline-flex items-center gap-1 text-xs font-normal hover:text-primary"
                          >
                            Classic editor
                            <ExternalLinkIcon className="size-3 opacity-70" />
                          </a>
                        ) : null}
                      </CardTitle>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-primary pointer-events-auto shrink-0 rounded-lg"
                        aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
                        onClick={() => r.id && toggle(r.id)}
                      >
                        <HeartIcon className={cn('size-4', favorited && 'fill-primary text-primary')} />
                      </Button>
                    </div>
                    <div className="border-border/60 from-muted/40 to-muted/15 space-y-2 rounded-xl border bg-linear-to-br px-3 py-2.5 dark:from-muted/25 dark:to-muted/10">
                      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                        <CalendarDaysIcon className="size-3.5 shrink-0 opacity-80" aria-hidden />
                        Editions
                      </div>
                      {r.latestEditionCommonDate ? (
                        <p className="text-foreground text-sm">
                          <span className="text-muted-foreground">Report date </span>
                          <span className="font-medium">{formatDateOnly(r.latestEditionCommonDate)}</span>
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-sm">No saved edition yet</p>
                      )}
                      {r.latestEditionCreatedAt ? (
                        <p className="text-muted-foreground text-xs">
                          Uploaded {formatDate(r.latestEditionCreatedAt)}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant="secondary" className="w-fit rounded-md font-normal">
                      {r.statusLabel}
                    </Badge>
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

        {!loading && rows.length > 0 ? (
          <PaginationBar
            page={page}
            hasNextPage={hasNextPage}
            disabled={availability === 'favorited' && favoriteIds.size === 0}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
            onJump={(p) => setPage(p)}
          />
        ) : null}
      </section>
    </div>
  )
}
