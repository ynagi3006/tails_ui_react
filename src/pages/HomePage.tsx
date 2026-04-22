import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRightIcon,
  BarChart3Icon,
  CalendarDaysIcon,
  CompassIcon,
  ExternalLinkIcon,
  HeartIcon,
  LayoutGridIcon,
  StarIcon,
  SparklesIcon,
  WrenchIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetchJson, getClassicUiReportUrl } from '@/lib/api'
import { formatDate, formatDateOnly } from '@/lib/format-date'
import { mapApiReportToCard, parseReportsResponse, type ReportCardModel } from '@/lib/report-mapper'
import { useMetricFavorites } from '@/hooks/use-metric-favorites'
import { useReportFavorites } from '@/hooks/use-report-favorites'
import { cn } from '@/lib/utils'

const RECENT_LIMIT = 8
const STARRED_LIMIT = 8
const FAVORITE_METRICS_LIMIT = 24
const METRICS_RECENT_LIMIT = 8

type MetricHomeRow = {
  id: string
  name: string
  unit: string
  tags: string[]
  created_at: string | null
  description: string
}

function parseMetricsList(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  return []
}

function mapMetricHome(r: Record<string, unknown>): MetricHomeRow {
  const id = String(r.id ?? r.metric_id ?? '')
  return {
    id,
    name: String(r.metric_name ?? r.name ?? 'Untitled metric'),
    unit: String(r.default_metric_format ?? r.unit ?? '') || '—',
    tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : [],
    created_at: (r.created_at as string | null | undefined) ?? null,
    description: String(r.description ?? ''),
  }
}

function buildQuery(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') sp.set(k, v)
  })
  return sp.toString()
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const shortcuts = [
  {
    to: '/reports',
    label: 'Report catalog',
    description: 'Search, filter, and manage every report — drafts through published.',
    icon: LayoutGridIcon,
    accent: 'from-violet-500/15 to-fuchsia-500/10',
  },
  {
    to: '/metrics',
    label: 'Metrics',
    description: 'Browse definitions, tags, and drill into individual metrics.',
    icon: BarChart3Icon,
    accent: 'from-sky-500/15 to-cyan-500/10',
  },
  {
    to: '/explore',
    label: 'Explore',
    description: 'Visual exploration of your metric graph and relationships.',
    icon: CompassIcon,
    accent: 'from-amber-500/15 to-orange-500/10',
  },
  {
    to: '/report-builder',
    label: 'Report builder',
    description: 'Compose templates and wire metrics into new reports.',
    icon: WrenchIcon,
    accent: 'from-emerald-500/15 to-teal-500/10',
  },
] as const

function CompactReportCard({
  r,
  favorited,
  onToggleFavorite,
}: {
  r: ReportCardModel
  favorited: boolean
  onToggleFavorite: () => void
}) {
  const classic = getClassicUiReportUrl(r.id)
  const href = `/reports/${encodeURIComponent(r.id)}`
  return (
    <Card className="border-border/70 group relative w-[min(100%,280px)] shrink-0 overflow-hidden rounded-2xl shadow-sm transition-shadow hover:shadow-md">
      <Link to={href} className="ring-ring absolute inset-0 z-0 rounded-2xl focus-visible:ring-2 focus-visible:outline-none" />
      <CardHeader className="relative z-10 gap-2 pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-2 text-base leading-snug">
            <span className="text-foreground group-hover:text-primary transition-colors">{r.title}</span>
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="pointer-events-auto shrink-0"
            aria-label={favorited ? 'Unstar report' : 'Star report'}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleFavorite()
            }}
          >
            <StarIcon className={cn('size-4', favorited && 'fill-primary text-primary')} />
          </Button>
        </div>
        {r.latestEditionCommonDate ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <CalendarDaysIcon className="size-3.5 shrink-0 opacity-70" />
            <span>{formatDateOnly(r.latestEditionCommonDate)}</span>
          </p>
        ) : null}
      </CardHeader>
      {r.description ? (
        <CardContent className="relative z-10 pt-0">
          <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">{r.description}</p>
        </CardContent>
      ) : null}
      {classic ? (
        <div className="relative z-10 px-6 pb-3">
          <a
            href={classic}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground inline-flex items-center gap-1 text-[11px] hover:text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            Classic UI
            <ExternalLinkIcon className="size-3" />
          </a>
        </div>
      ) : null}
    </Card>
  )
}

function CompactMetricCard({
  m,
  favorited,
  onToggleFavorite,
  className,
}: {
  m: MetricHomeRow
  favorited: boolean
  onToggleFavorite: () => void
  className?: string
}) {
  const href = `/metrics/${encodeURIComponent(m.id)}`
  return (
    <Card
      className={cn(
        'border-border/70 group relative w-[min(100%,280px)] shrink-0 overflow-hidden rounded-2xl shadow-sm transition-shadow hover:shadow-md',
        className,
      )}
    >
      <Link to={href} className="ring-ring absolute inset-0 z-0 rounded-2xl focus-visible:ring-2 focus-visible:outline-none" />
      <CardHeader className="pointer-events-none relative z-10 gap-2 pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-2 text-base leading-snug">
            <span className="text-foreground group-hover:text-primary transition-colors">{m.name}</span>
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="pointer-events-auto shrink-0"
            aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleFavorite()
            }}
          >
            <HeartIcon className={cn('size-4', favorited && 'fill-primary text-primary')} />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="rounded-md text-[10px] font-normal">
            {m.unit}
          </Badge>
          {m.tags.slice(0, 2).map((t) => (
            <Badge key={t} variant="secondary" className="rounded-md text-[10px] font-normal">
              {t}
            </Badge>
          ))}
          {m.tags.length > 2 ? (
            <span className="text-muted-foreground text-[10px]">+{m.tags.length - 2}</span>
          ) : null}
        </div>
        {m.created_at ? (
          <p className="text-muted-foreground text-[11px]">Created {formatDate(m.created_at)}</p>
        ) : null}
      </CardHeader>
      {m.description ? (
        <CardContent className="pointer-events-none relative z-10 pt-0">
          <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">{m.description}</p>
        </CardContent>
      ) : null}
    </Card>
  )
}

export function HomePage() {
  const { ids: favoriteIds, count: favoriteCount, toggle, has } = useReportFavorites()
  const {
    ids: metricFavoriteIds,
    count: metricFavoriteCount,
    toggle: toggleMetricFavorite,
    has: hasMetricFavorite,
  } = useMetricFavorites()

  const [recent, setRecent] = useState<ReportCardModel[]>([])
  const [starred, setStarred] = useState<ReportCardModel[]>([])
  const [favoriteMetrics, setFavoriteMetrics] = useState<MetricHomeRow[]>([])
  const [recentMetrics, setRecentMetrics] = useState<MetricHomeRow[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)
  const [loadingStarred, setLoadingStarred] = useState(true)
  const [loadingFavoriteMetrics, setLoadingFavoriteMetrics] = useState(true)
  const [loadingRecentMetrics, setLoadingRecentMetrics] = useState(true)
  const [errorRecent, setErrorRecent] = useState<string | null>(null)
  const [errorRecentMetrics, setErrorRecentMetrics] = useState<string | null>(null)

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true)
    setErrorRecent(null)
    try {
      const qs = buildQuery({
        limit: String(RECENT_LIMIT),
        skip: '0',
        sort: 'created_at',
        order: 'desc',
        status: 'published',
      })
      const data = await apiFetchJson<unknown>(`/reports?${qs}`)
      const list = parseReportsResponse(data)
      setRecent(list.map((r) => mapApiReportToCard(r)))
    } catch (e) {
      setErrorRecent(e instanceof Error ? e.message : 'Failed to load reports')
      setRecent([])
    } finally {
      setLoadingRecent(false)
    }
  }, [])

  const loadRecentMetrics = useCallback(async () => {
    setLoadingRecentMetrics(true)
    setErrorRecentMetrics(null)
    try {
      const qs = buildQuery({
        limit: String(METRICS_RECENT_LIMIT),
        skip: '0',
        sort: 'created_at',
        order: 'desc',
      })
      const data = await apiFetchJson<unknown>(`/metrics?${qs}`)
      setRecentMetrics(parseMetricsList(data).map(mapMetricHome))
    } catch (e) {
      setErrorRecentMetrics(e instanceof Error ? e.message : 'Failed to load metrics')
      setRecentMetrics([])
    } finally {
      setLoadingRecentMetrics(false)
    }
  }, [])

  const favList = useMemo(() => Array.from(favoriteIds), [favoriteIds])
  const metricFavList = useMemo(() => Array.from(metricFavoriteIds), [metricFavoriteIds])

  const loadFavoriteMetrics = useCallback(async () => {
    setLoadingFavoriteMetrics(true)
    try {
      if (metricFavList.length === 0) {
        setFavoriteMetrics([])
        setLoadingFavoriteMetrics(false)
        return
      }
      const qs = buildQuery({
        limit: String(FAVORITE_METRICS_LIMIT),
        skip: '0',
        metric_ids: metricFavList.join(','),
      })
      const data = await apiFetchJson<unknown>(`/metrics?${qs}`)
      const rows = parseMetricsList(data).map(mapMetricHome)
      // Only show IDs the user actually favorited (in order). If the API ignores `metric_ids`
      // or returns extras, we still render at most one card per favorite.
      const byId = new Map(rows.map((m) => [m.id, m]))
      setFavoriteMetrics(
        metricFavList.map((id) => byId.get(id)).filter((m): m is MetricHomeRow => Boolean(m)),
      )
    } catch {
      setFavoriteMetrics([])
    } finally {
      setLoadingFavoriteMetrics(false)
    }
  }, [metricFavList])

  const loadStarred = useCallback(async () => {
    setLoadingStarred(true)
    try {
      if (favList.length === 0) {
        setStarred([])
        setLoadingStarred(false)
        return
      }
      const qs = buildQuery({
        limit: String(STARRED_LIMIT),
        skip: '0',
        sort: 'created_at',
        order: 'desc',
        status: 'published',
        report_ids: favList.join(','),
      })
      const data = await apiFetchJson<unknown>(`/reports?${qs}`)
      const list = parseReportsResponse(data)
      setStarred(list.map((r) => mapApiReportToCard(r)))
    } catch {
      setStarred([])
    } finally {
      setLoadingStarred(false)
    }
  }, [favList])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  useEffect(() => {
    void loadRecentMetrics()
  }, [loadRecentMetrics])

  useEffect(() => {
    void loadStarred()
  }, [loadStarred])

  useEffect(() => {
    void loadFavoriteMetrics()
  }, [loadFavoriteMetrics])

  return (
    <div className="space-y-10 pb-8">
      {/* Hero */}
      <section className="border-border/60 from-primary/6 via-background to-muted/30 relative overflow-hidden rounded-3xl border bg-linear-to-br px-6 py-10 sm:px-10 sm:py-12 dark:from-primary/10 dark:via-background dark:to-muted/20">
        <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative max-w-2xl space-y-4">
          <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">{greeting()}</p>
          <h1 className="text-foreground text-3xl font-bold tracking-tight sm:text-4xl">Your Tails workspace</h1>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed">
            Jump into reports and metrics, or pick up where you left off. Use the assistant in the corner for questions
            — including follow-ups after you open a report.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button asChild className="rounded-xl">
              <Link to="/reports">
                Open report catalog
                <ArrowRightIcon className="ml-1 size-4" />
              </Link>
            </Button>
            {favoriteCount > 0 ? (
              <Badge variant="secondary" className="rounded-full px-3 py-1 font-normal">
                <StarIcon className="mr-1 size-3 fill-primary text-primary" />
                {favoriteCount} starred report{favoriteCount === 1 ? '' : 's'}
              </Badge>
            ) : null}
            {metricFavoriteCount > 0 ? (
              <Badge variant="secondary" className="rounded-full px-3 py-1 font-normal">
                <HeartIcon className="mr-1 size-3 fill-primary text-primary" />
                {metricFavoriteCount} metric{metricFavoriteCount === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </div>
        </div>
      </section>

      {/* Shortcuts — distinct from catalog */}
      <section className="space-y-4">
        <div>
          <h2 className="text-foreground text-lg font-semibold tracking-tight">Where to next</h2>
          <p className="text-muted-foreground mt-1 text-sm">Each area has a different job — home keeps the highlights only.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {shortcuts.map(({ to, label, description, icon: Icon, accent }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'border-border/70 from-card to-muted/25 hover:border-primary/25 group rounded-2xl border bg-linear-to-br p-5 shadow-sm transition-[border-color,box-shadow] hover:shadow-md',
                accent,
              )}
            >
              <div className="bg-background/80 mb-3 flex size-10 items-center justify-center rounded-xl shadow-sm ring-1 ring-border/50">
                <Icon className="text-foreground size-5 opacity-90" />
              </div>
              <h3 className="text-foreground group-hover:text-primary flex items-center gap-1 text-sm font-semibold">
                {label}
                <ArrowRightIcon className="size-3.5 opacity-0 transition-opacity group-hover:opacity-70" />
              </h3>
              <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">{description}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Tips — unique content */}
      <section className="grid gap-6 lg:grid-cols-[1fr_minmax(260px,320px)]">
        <Card className="border-border/70 rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex size-9 items-center justify-center rounded-lg">
                <SparklesIcon className="size-4" />
              </span>
              <div>
                <CardTitle className="text-base">Tips for this UI</CardTitle>
                <CardDescription className="text-xs">Things you can’t do from the classic catalog alone.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="text-muted-foreground list-inside list-disc space-y-2 leading-relaxed">
              <li>
                On a report, <strong className="text-foreground">click a metric name</strong> to open the assistant with
                context — then ask follow-up questions in the same thread.
              </li>
              <li>
                Use <strong className="text-foreground">AI Report Analysis</strong> on the report page for a section-style
                summary of the current edition.
              </li>
              <li>
                Star reports here or on cards; they appear in <strong className="text-foreground">Starred reports</strong>{' '}
                below.
              </li>
              <li>
                Heart metrics from the catalog or home cards; they appear in{' '}
                <strong className="text-foreground">Favorite metrics</strong> below.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-muted/20 rounded-2xl border-dashed shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Need the full list?</CardTitle>
            <CardDescription>
              Filters, table view, drafts, and &quot;new report&quot; live on the catalog — not here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full rounded-xl">
              <Link to="/reports">Go to Reports</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Starred */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-foreground flex items-center gap-2 text-lg font-semibold tracking-tight">
              <StarIcon className="text-primary size-5" />
              Starred reports
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">Your pinned set — scroll sideways on small screens.</p>
          </div>
          {favoriteCount > STARRED_LIMIT ? (
            <Button asChild variant="ghost" size="sm" className="rounded-lg text-xs">
              <Link to="/reports">See all in catalog</Link>
            </Button>
          ) : null}
        </div>
        {loadingStarred ? (
          <div className="flex gap-4 overflow-hidden pb-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-64 shrink-0 rounded-2xl" />
            ))}
          </div>
        ) : starred.length === 0 ? (
          <Card className="border-border/60 rounded-2xl border-dashed shadow-none">
            <CardContent className="text-muted-foreground py-10 text-center text-sm">
              No starred reports yet. Open the{' '}
              <Link to="/reports" className="text-primary font-medium underline-offset-4 hover:underline">
                catalog
              </Link>{' '}
              or any report card and tap the star.
            </CardContent>
          </Card>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:thin]">
            {starred.map((r, i) => (
              <CompactReportCard
                key={r.id || i}
                r={r}
                favorited={has(r.id)}
                onToggleFavorite={() => r.id && toggle(r.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Favorite metrics */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-foreground flex items-center gap-2 text-lg font-semibold tracking-tight">
              <HeartIcon className="text-primary size-5" aria-hidden />
              Favorite metrics
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">Metrics you’ve hearted — scroll sideways on small screens.</p>
          </div>
          {metricFavoriteCount > FAVORITE_METRICS_LIMIT ? (
            <Button asChild variant="ghost" size="sm" className="rounded-lg text-xs">
              <Link to="/metrics">See all in catalog</Link>
            </Button>
          ) : null}
        </div>
        {loadingFavoriteMetrics ? (
          <div className="flex gap-4 overflow-hidden pb-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-64 shrink-0 rounded-2xl" />
            ))}
          </div>
        ) : favoriteMetrics.length === 0 ? (
          <Card className="border-border/60 rounded-2xl border-dashed shadow-none">
            <CardContent className="text-muted-foreground py-10 text-center text-sm">
              No favorite metrics yet. Open the{' '}
              <Link to="/metrics" className="text-primary font-medium underline-offset-4 hover:underline">
                metrics catalog
              </Link>{' '}
              or a metric detail page and tap the heart.
            </CardContent>
          </Card>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:thin]">
            {favoriteMetrics.map((m, i) => (
              <CompactMetricCard
                key={m.id || i}
                m={m}
                favorited={hasMetricFavorite(m.id)}
                onToggleFavorite={() => m.id && toggleMetricFavorite(m.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recently added */}
      <section className="space-y-4">
        <div>
          <h2 className="text-foreground text-lg font-semibold tracking-tight">Recently published</h2>
          <p className="text-muted-foreground mt-1 text-sm">Newest additions to the library — not a full search.</p>
        </div>
        {errorRecent ? (
          <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-2xl border px-4 py-3 text-sm" role="alert">
            {errorRecent}
          </div>
        ) : null}
        {loadingRecent ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">No published reports yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((r, i) => {
              const href = `/reports/${encodeURIComponent(r.id)}`
              return (
                <Card
                  key={r.id || i}
                  className="border-border/70 group relative overflow-hidden rounded-2xl shadow-sm transition-shadow hover:shadow-md"
                >
                  <Link to={href} className="ring-ring absolute inset-0 z-0 rounded-2xl focus-visible:ring-2 focus-visible:outline-none" />
                  <CardHeader className="relative z-10 gap-1 pb-2">
                    <CardTitle className="line-clamp-2 text-sm font-semibold leading-snug">
                      <span className="group-hover:text-primary transition-colors">{r.title}</span>
                    </CardTitle>
                    {r.latestEditionCreatedAt ? (
                      <p className="text-muted-foreground text-[11px]">Uploaded {formatDate(r.latestEditionCreatedAt)}</p>
                    ) : null}
                  </CardHeader>
                  {r.description ? (
                    <CardContent className="relative z-10 pt-0">
                      <p className="text-muted-foreground line-clamp-2 text-xs">{r.description}</p>
                    </CardContent>
                  ) : null}
                </Card>
              )
            })}
          </div>
        )}
        {!loadingRecent && recent.length > 0 ? (
          <p className="text-center">
            <Link
              to="/reports"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium"
            >
              Browse all reports
              <ArrowRightIcon className="size-4" />
            </Link>
          </p>
        ) : null}
      </section>

      {/* Recently added metrics */}
      <section className="space-y-4">
        <div>
          <h2 className="text-foreground flex items-center gap-2 text-lg font-semibold tracking-tight">
            <BarChart3Icon className="text-sky-600 dark:text-sky-400 size-5" aria-hidden />
            Recently added metrics
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">Newest metric definitions — same sort as the catalog default.</p>
        </div>
        {errorRecentMetrics ? (
          <div
            className="border-destructive/30 bg-destructive/5 text-destructive rounded-2xl border px-4 py-3 text-sm"
            role="alert"
          >
            {errorRecentMetrics}
          </div>
        ) : null}
        {loadingRecentMetrics ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        ) : recentMetrics.length === 0 ? (
          <p className="text-muted-foreground text-sm">No metrics yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recentMetrics.map((m, i) => (
              <CompactMetricCard
                key={m.id || i}
                className="w-full min-w-0 shrink"
                m={m}
                favorited={hasMetricFavorite(m.id)}
                onToggleFavorite={() => m.id && toggleMetricFavorite(m.id)}
              />
            ))}
          </div>
        )}
        {!loadingRecentMetrics && recentMetrics.length > 0 ? (
          <p className="text-center">
            <Link
              to="/metrics"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium"
            >
              Browse all metrics
              <ArrowRightIcon className="size-4" />
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  )
}
