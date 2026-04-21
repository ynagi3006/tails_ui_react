import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  ExternalLinkIcon,
  NetworkIcon,
  RotateCcwIcon,
  SearchIcon,
  TableIcon,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiFetchJson, getClassicUiExploreUrl } from '@/lib/api'
import {
  expandExploreGraphFromFavorites,
  layoutExploreFlow,
  parseExploreGraph,
  visibleExploreSubgraph,
  type ExploreApiNode,
} from '@/lib/explore-graph'
import { cn } from '@/lib/utils'
import { useMetricFavorites } from '@/hooks/use-metric-favorites'
import { useReportFavorites } from '@/hooks/use-report-favorites'

type ViewMode = 'graph' | 'table'

function ExploreReportNode({ data, selected }: NodeProps) {
  const raw = data.raw as ExploreApiNode
  const label = String(data.label ?? '')
  const sourceHandle = (data.sourceHandle as Position | undefined) ?? Position.Bottom
  return (
    <>
      <Handle
        type="source"
        position={sourceHandle}
        className="size-2.5 border-2 border-primary-foreground/25 bg-primary shadow-sm"
      />
      <div
        className={cn(
          'text-card-foreground w-[220px] max-w-[min(220px,88vw)] rounded-xl border border-primary/25 bg-primary/7 py-2 pl-3 pr-3 text-left shadow-sm transition-[box-shadow,border-color,background-color] duration-150 dark:border-primary/35 dark:bg-primary/15',
          selected
            ? 'border-primary/55 bg-primary/11 shadow-md ring-2 ring-primary/25 dark:ring-primary/35'
            : 'hover:border-primary/40 hover:bg-primary/10',
        )}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="bg-primary/18 text-primary dark:bg-primary/25 dark:text-primary-foreground inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase">
            Report
          </span>
        </div>
        <p className="text-foreground text-[0.8125rem] leading-snug font-semibold tracking-tight wrap-break-word">{label}</p>
        {raw.metric_count != null ? (
          <p className="text-primary/80 dark:text-primary-foreground/80 mt-1 text-[0.6875rem] tabular-nums">
            {raw.metric_count} metric{raw.metric_count === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>
    </>
  )
}

function ExploreMetricNode({ data, selected }: NodeProps) {
  const label = String(data.label ?? '')
  const targetHandle = (data.targetHandle as Position | undefined) ?? Position.Top
  return (
    <>
      <Handle
        type="target"
        position={targetHandle}
        className="size-2.5 border-2 border-teal-950/20 bg-teal-600 shadow-sm dark:border-teal-950/40 dark:bg-teal-400"
      />
      <div
        className={cn(
          'w-[188px] max-w-[min(188px,88vw)] rounded-md border border-teal-700/25 bg-teal-500/8 py-2 pl-2.5 pr-2.5 text-left shadow-sm transition-[box-shadow,border-color,background-color] duration-150 dark:border-teal-400/30 dark:bg-teal-400/12',
          selected
            ? 'border-teal-600/50 bg-teal-500/14 shadow-md ring-2 ring-teal-600/25 dark:border-teal-400/55 dark:bg-teal-400/18 dark:ring-teal-400/30'
            : 'hover:border-teal-600/40 hover:bg-teal-500/12 dark:hover:border-teal-400/45',
        )}
      >
        <div className="mb-1">
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide text-teal-900 uppercase bg-teal-600/15 dark:bg-teal-400/20 dark:text-teal-50">
            Metric
          </span>
        </div>
        <p className="text-teal-950 dark:text-teal-50 text-[0.75rem] leading-snug font-medium tracking-tight wrap-break-word">
          {label}
        </p>
      </div>
    </>
  )
}

const nodeTypes = {
  exploreReport: ExploreReportNode,
  exploreMetric: ExploreMetricNode,
}

function ExploreFlowPanel({
  selected,
  onReset,
  onOpenReport,
  onOpenMetric,
  busy,
}: {
  selected: ExploreApiNode | null
  onReset: () => void
  onOpenReport: (id: string) => void
  onOpenMetric: (metricVersionId: string) => void
  busy: boolean
}) {
  return (
    <Panel position="top-right" className="m-2 max-w-[min(100vw-1rem,280px)]">
      <div className="border-border/60 bg-card w-full space-y-3 rounded-lg border p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-md" onClick={onReset}>
            <RotateCcwIcon className="size-3.5" />
            Reset
          </Button>
        </div>
        {selected ? (
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-muted-foreground text-[0.625rem] font-medium tracking-wide uppercase">Selected</p>
              <p className="text-foreground font-medium leading-snug">{selected.name}</p>
              <Badge
                variant="outline"
                className={cn(
                  'mt-1 rounded-md border capitalize',
                  selected.type === 'report'
                    ? 'border-primary/35 bg-primary/10 text-primary dark:border-primary/45 dark:bg-primary/20 dark:text-primary-foreground'
                    : 'border-teal-600/40 bg-teal-500/10 text-teal-900 dark:border-teal-400/45 dark:bg-teal-400/15 dark:text-teal-50',
                )}
              >
                {selected.type}
              </Badge>
            </div>
            {selected.tags.length ? (
              <div className="flex flex-wrap gap-1">
                {selected.tags.map((t) => (
                  <Badge key={t} variant="outline" className="font-normal">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : null}
            {selected.owned_by ? (
              <p className="text-muted-foreground text-xs">
                Owned by <span className="text-foreground font-medium">{selected.owned_by}</span>
              </p>
            ) : null}
            {selected.type === 'metric' && selected.datapoint_count != null ? (
              <p className="text-muted-foreground text-xs tabular-nums">
                {selected.datapoint_count.toLocaleString()} datapoints
              </p>
            ) : null}
            {selected.type === 'metric' && selected.dimensions?.length ? (
              <p className="text-muted-foreground text-xs">
                Dimensions:{' '}
                <span className="text-foreground">{selected.dimensions.slice(0, 6).join(', ')}</span>
                {selected.dimensions.length > 6 ? '…' : ''}
              </p>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="w-full rounded-md"
              disabled={busy}
              onClick={() =>
                selected.type === 'report' ? onOpenReport(selected.id) : onOpenMetric(selected.id)
              }
            >
              {busy ? 'Opening…' : selected.type === 'report' ? 'Open report' : 'Open metric'}
            </Button>
          </div>
        ) : null}
      </div>
    </Panel>
  )
}

function ExplorePageInner() {
  const navigate = useNavigate()
  const rf = useReactFlow()
  const classicExplore = getClassicUiExploreUrl()
  const { ids: favoriteReportIds } = useReportFavorites()
  const { ids: favoriteMetricIds } = useMetricFavorites()

  const [fullNodes, setFullNodes] = useState<ExploreApiNode[]>([])
  const [fullEdges, setFullEdges] = useState<{ source: string; target: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [view, setView] = useState<ViewMode>('graph')
  const [tagInput, setTagInput] = useState('')
  const [tagApplied, setTagApplied] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openBusy, setOpenBusy] = useState(false)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetchJson<unknown>('/explore/graph')
      const parsed = parseExploreGraph(data)
      setFullNodes(parsed.nodes)
      setFullEdges(parsed.edges)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load explore graph')
      setFullNodes([])
      setFullEdges([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const { nodes: favNodes, edges: favEdges } = useMemo(
    () => expandExploreGraphFromFavorites(fullNodes, fullEdges, favoriteReportIds, favoriteMetricIds),
    [fullNodes, fullEdges, favoriteReportIds, favoriteMetricIds],
  )

  const visible = useMemo(
    () => visibleExploreSubgraph(favNodes, favEdges, tagApplied, focusId),
    [favNodes, favEdges, tagApplied, focusId],
  )

  const selectedNode = useMemo(
    () => (selectedId ? favNodes.find((n) => n.id === selectedId) ?? null : null),
    [favNodes, selectedId],
  )

  useEffect(() => {
    if (!selectedId) return
    if (favNodes.some((n) => n.id === selectedId)) return
    setSelectedId(null)
    setFocusId(null)
  }, [selectedId, favNodes])

  useEffect(() => {
    const { nodes: laidOutNodes, edges: laidOutEdges } = layoutExploreFlow(visible.nodes, visible.edges)
    setNodes(laidOutNodes.map((n) => ({ ...n, selected: n.id === selectedId })))
    setEdges(laidOutEdges)
  }, [visible.nodes, visible.edges, selectedId, setNodes, setEdges])

  useEffect(() => {
    if (nodes.length === 0) return
    const id = requestAnimationFrame(() => {
      rf.fitView({ padding: 0.12, duration: 280, minZoom: 0.02, maxZoom: 2 })
    })
    return () => cancelAnimationFrame(id)
  }, [nodes, edges, rf])

  const reset = useCallback(() => {
    setTagInput('')
    setTagApplied('')
    setFocusId(null)
    setSelectedId(null)
  }, [])

  const applyTag = useCallback(() => {
    setTagApplied(tagInput.trim())
  }, [tagInput])

  const onNodeClick = useCallback(
    (_: MouseEvent, node: Node) => {
      setSelectedId(node.id)
      setFocusId(node.id)
    },
    [],
  )

  const onPaneClick = useCallback(() => {
    setSelectedId(null)
    setFocusId(null)
  }, [])

  const onOpenReport = useCallback(
    (reportId: string) => {
      navigate(`/reports/${encodeURIComponent(reportId)}`)
    },
    [navigate],
  )

  const onOpenMetric = useCallback(
    async (metricVersionId: string) => {
      setOpenBusy(true)
      try {
        const m = await apiFetchJson<Record<string, unknown>>(
          `/metrics/version/${encodeURIComponent(metricVersionId)}`,
        )
        const id = String(m.id ?? m.metric_id ?? '')
        if (id) navigate(`/metrics/${encodeURIComponent(id)}`)
      } catch {
        /* stay on page */
      } finally {
        setOpenBusy(false)
      }
    },
    [navigate],
  )

  const tableRows = useMemo(() => {
    const { nodes: n } = visibleExploreSubgraph(favNodes, favEdges, tagApplied, focusId)
    return [...n].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'report' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [favNodes, favEdges, tagApplied, focusId])

  const hasAnyFavorites = favoriteReportIds.size > 0 || favoriteMetricIds.size > 0
  const emptyNoFavorites =
    !loading && fullNodes.length > 0 && favNodes.length === 0 && !hasAnyFavorites

  return (
    <div className="space-y-6">
      <PageHeader
        title="Explore"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => void load()}>
              Refresh
            </Button>
            {classicExplore ? (
              <Button size="sm" className="gap-1.5 rounded-xl" asChild>
                <a href={classicExplore} target="_blank" rel="noreferrer">
                  Classic explore
                  <ExternalLinkIcon className="size-3.5 opacity-80" />
                </a>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="bg-muted/30 flex flex-wrap items-center gap-0.5 rounded-lg border border-border/60 p-0.5">
        <Button
          type="button"
          size="sm"
          variant={view === 'graph' ? 'secondary' : 'ghost'}
          className="h-8 rounded-md px-3.5"
          onClick={() => setView('graph')}
        >
          <NetworkIcon className="mr-1.5 size-3.5 opacity-70" />
          Graph
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === 'table' ? 'secondary' : 'ghost'}
          className="h-8 rounded-md px-3.5"
          onClick={() => setView('table')}
        >
          <TableIcon className="mr-1.5 size-3.5 opacity-70" />
          Table
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1.5 sm:max-w-xs sm:flex-1">
          <label htmlFor="explore-tag" className="text-muted-foreground text-xs font-medium">
            Filter by tag
          </label>
          <div className="flex gap-2">
            <Input
              id="explore-tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyTag()
              }}
              placeholder="e.g. revenue, daily"
              className="rounded-lg"
              autoComplete="off"
            />
            <Button type="button" variant="secondary" className="shrink-0 rounded-lg" onClick={applyTag}>
              <SearchIcon className="size-4" />
              <span className="sr-only">Search tags</span>
            </Button>
          </div>
        </div>
        <div className="text-muted-foreground max-w-sm space-y-1 text-xs leading-relaxed sm:text-right">
          <p>
            Built from starred reports and metrics, then expanded: metrics used by those reports, and other reports
            that share those metrics. Reports cluster toward the center; metrics fan outward.
          </p>
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
            <span className="text-primary inline-flex items-center gap-1.5 font-medium">
              <span className="bg-primary size-2 rounded-sm shadow-sm ring-1 ring-primary/30" aria-hidden />
              Report
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-teal-800 dark:text-teal-300">
              <span className="size-2 rounded-sm bg-teal-600 shadow-sm ring-1 ring-teal-600/35 dark:bg-teal-400" aria-hidden />
              Metric
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <div
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-2xl border px-4 py-3 text-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <Skeleton className="h-[min(80vh,900px)] min-h-[480px] w-full rounded-2xl" />
      ) : view === 'graph' ? (
        favNodes.length === 0 ? (
          <div className="border-border/70 text-muted-foreground space-y-3 rounded-2xl border border-dashed px-6 py-16 text-center text-sm">
            {fullNodes.length === 0 ? (
              <p>No reports or metrics linked in the graph yet.</p>
            ) : emptyNoFavorites ? (
              <>
                <p>This map needs at least one starred report or metric to start from.</p>
                <p>
                  Open{' '}
                  <Link className="text-foreground font-medium underline underline-offset-4" to="/metrics">
                    Metrics
                  </Link>{' '}
                  or{' '}
                  <Link className="text-foreground font-medium underline underline-offset-4" to="/reports">
                    Reports
                  </Link>{' '}
                  and tap the heart on a report you care about (or a metric). Linked metrics and related reports appear
                  automatically.
                </p>
              </>
            ) : (
              <p>
                None of your starred reports or metrics appear in the catalog graph yet. Confirm report IDs match the
                catalog, star a metric that appears in mappings, or refresh after new data loads.
              </p>
            )}
          </div>
        ) : (
          <div className="border-border/80 relative mx-auto h-[min(82vh,920px)] min-h-[520px] w-full max-w-[1680px] overflow-hidden rounded-xl border bg-muted/20 shadow-sm">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.12, minZoom: 0.02, maxZoom: 2 }}
              minZoom={0.02}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              className="bg-transparent"
            >
              <Background gap={36} size={0.85} className="bg-transparent" color="var(--border)" />
              <Controls className="rounded-lg border border-border/70 bg-card shadow-sm" />
              <MiniMap
                className="rounded-md border border-border/60 bg-card/90 shadow-sm"
                style={{ width: 112, height: 72 }}
                pannable
                zoomable
                nodeStrokeWidth={1}
                nodeColor={(n) =>
                  n.type === 'exploreReport' ? 'var(--primary)' : 'oklch(0.55 0.14 180)'
                }
                maskColor="oklch(0.5 0.02 280 / 0.08)"
              />
              <ExploreFlowPanel
                selected={selectedNode}
                onReset={reset}
                onOpenReport={onOpenReport}
                onOpenMetric={(id) => void onOpenMetric(id)}
                busy={openBusy}
              />
            </ReactFlow>
          </div>
        )
      ) : favNodes.length === 0 ? (
        <div className="border-border/70 text-muted-foreground space-y-3 rounded-2xl border border-dashed px-6 py-16 text-center text-sm">
          {fullNodes.length === 0 ? (
            <p>No rows to show.</p>
          ) : emptyNoFavorites ? (
            <>
              <p>The table lists the same subgraph as the graph (starred seeds plus connections).</p>
              <p>
                Add hearts on{' '}
                <Link className="text-foreground font-medium underline underline-offset-4" to="/metrics">
                  Metrics
                </Link>{' '}
                or{' '}
                <Link className="text-foreground font-medium underline underline-offset-4" to="/reports">
                  Reports
                </Link>
                .
              </p>
            </>
          ) : (
            <p>None of your starred items appear in the loaded graph yet.</p>
          )}
        </div>
      ) : (
        <div className="border-border/70 overflow-hidden rounded-2xl border shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[120px] text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.map((row) => {
                const isSel = row.id === selectedId
                return (
                  <TableRow
                    key={row.id}
                    className={cn('cursor-pointer', isSel && 'bg-muted/40')}
                    onClick={() => {
                      setSelectedId(row.id)
                      setFocusId(row.id)
                    }}
                  >
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'rounded-md capitalize',
                          row.type === 'report'
                            ? 'border-primary/35 bg-primary/10 text-primary dark:border-primary/45 dark:bg-primary/20 dark:text-primary-foreground'
                            : 'border-teal-600/40 bg-teal-500/10 text-teal-900 dark:border-teal-400/45 dark:bg-teal-400/15 dark:text-teal-50',
                        )}
                      >
                        {row.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">
                      {row.type === 'report' ? (
                        <Button variant="link" className="h-auto p-0" asChild>
                          <Link to={`/reports/${encodeURIComponent(row.id)}`}>Open</Link>
                        </Button>
                      ) : (
                        <Button
                          variant="link"
                          className="h-auto p-0"
                          disabled={openBusy}
                          onClick={(e) => {
                            e.stopPropagation()
                            void onOpenMetric(row.id)
                          }}
                        >
                          Open
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {view === 'table' && favNodes.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          Click a row to focus that node in the graph view. Use Open to navigate.
        </p>
      ) : null}
    </div>
  )
}

export function ExplorePage() {
  return (
    <ReactFlowProvider>
      <ExplorePageInner />
    </ReactFlowProvider>
  )
}
