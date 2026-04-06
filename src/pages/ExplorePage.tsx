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
  layoutExploreFlow,
  parseExploreGraph,
  visibleExploreSubgraph,
  type ExploreApiNode,
} from '@/lib/explore-graph'
import { cn } from '@/lib/utils'

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
        className="!bg-primary !border-background !h-2.5 !w-2.5 !border-2 shadow-[0_0_12px_var(--primary)]"
      />
      <div
        className={cn(
          'from-primary/20 via-primary/8 border-primary/55 to-card/90 w-[228px] max-w-[min(228px,88vw)] rounded-2xl border-2 bg-gradient-to-br px-3.5 py-2.5 text-left shadow-[0_4px_24px_oklch(0.52_0.22_290/0.12)] transition-all duration-200',
          selected && 'ring-primary/50 scale-[1.02] ring-2 ring-offset-2 ring-offset-background',
        )}
      >
        <p className="text-foreground text-[0.8rem] leading-snug font-semibold tracking-tight break-words">{label}</p>
        {raw.metric_count != null ? (
          <p className="text-muted-foreground mt-1 text-[0.65rem] tabular-nums">
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
        className="!bg-accent !border-background !h-2.5 !w-2.5 !border-2 shadow-[0_0_10px_var(--accent)]"
      />
      <div
        className={cn(
          'border-border/80 from-card/95 to-muted/40 w-[196px] max-w-[min(196px,88vw)] rounded-2xl border bg-gradient-to-b px-3 py-2.5 text-left shadow-[0_2px_16px_oklch(0_0_0/0.06)] transition-all duration-200 dark:shadow-[0_2px_20px_oklch(0_0_0/0.25)]',
          selected && 'ring-accent/40 scale-[1.02] ring-2 ring-offset-2 ring-offset-background',
        )}
      >
        <p className="text-foreground text-[0.75rem] leading-snug font-semibold tracking-tight break-words">{label}</p>
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
    <Panel position="top-right" className="m-2 max-w-[min(100vw-1rem,320px)]">
      <div className="border-border/70 bg-card/95 w-full space-y-3 rounded-xl border p-3 shadow-lg backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg" onClick={onReset}>
            <RotateCcwIcon className="size-3.5" />
            Reset
          </Button>
        </div>
        {selected ? (
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-muted-foreground text-[0.65rem] font-medium tracking-wide uppercase">Selected</p>
              <p className="text-foreground font-medium leading-snug">{selected.name}</p>
              <Badge variant="secondary" className="mt-1 rounded-md capitalize">
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
              className="w-full rounded-lg"
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

  const visible = useMemo(
    () => visibleExploreSubgraph(fullNodes, fullEdges, tagApplied, focusId),
    [fullNodes, fullEdges, tagApplied, focusId],
  )

  const selectedNode = useMemo(
    () => (selectedId ? fullNodes.find((n) => n.id === selectedId) ?? null : null),
    [fullNodes, selectedId],
  )

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
    const { nodes: n } = visibleExploreSubgraph(fullNodes, fullEdges, tagApplied, focusId)
    return [...n].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'report' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [fullNodes, fullEdges, tagApplied, focusId])

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

      <div className="border-border/60 bg-muted/25 flex flex-wrap items-center gap-2 rounded-full border p-1">
        <Button
          type="button"
          size="sm"
          variant={view === 'graph' ? 'secondary' : 'ghost'}
          className="h-9 rounded-full px-4"
          onClick={() => setView('graph')}
        >
          <NetworkIcon className="mr-1.5 size-3.5 opacity-80" />
          Graph
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === 'table' ? 'secondary' : 'ghost'}
          className="h-9 rounded-full px-4"
          onClick={() => setView('table')}
        >
          <TableIcon className="mr-1.5 size-3.5 opacity-80" />
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
        <div className="text-muted-foreground flex flex-col gap-1 text-xs sm:items-end">
          <span className="flex items-center gap-1.5">
            <span className="border-primary/60 bg-primary/25 size-2.5 rounded-full border-2 shadow-[0_0_8px_var(--primary)]" aria-hidden />
            Reports <span className="text-muted-foreground/80 font-normal">(center hub)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="border-border size-2.5 rounded-md border-2 bg-gradient-to-br from-card to-muted" aria-hidden />
            Metrics <span className="text-muted-foreground/80 font-normal">(around · can link to multiple reports)</span>
          </span>
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
        fullNodes.length === 0 ? (
          <div className="border-border/70 text-muted-foreground rounded-2xl border border-dashed px-6 py-16 text-center text-sm">
            No reports or metrics linked in the graph yet.
          </div>
        ) : (
          <div className="border-border/70 relative mx-auto h-[min(82vh,920px)] min-h-[520px] w-full max-w-[1680px] overflow-hidden rounded-2xl border shadow-lg">
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl opacity-90"
              style={{
                background:
                  'radial-gradient(ellipse 55% 45% at 50% 48%, var(--primary) 0%, transparent 62%), radial-gradient(ellipse 100% 80% at 50% 50%, var(--muted) 0%, var(--background) 70%)',
              }}
              aria-hidden
            />
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
              className="relative z-[1] bg-transparent"
            >
              <Panel position="top-left" className="pointer-events-none m-3 max-w-[13rem]">
                <div className="border-border/60 bg-card/85 text-muted-foreground rounded-xl border px-3 py-2.5 text-[0.7rem] leading-snug shadow-md backdrop-blur-md">
                  <p className="text-foreground font-medium">Radial map</p>
                  <p>Purple hub = reports. Outer cards = metrics. Shared metrics sit between their reports.</p>
                </div>
              </Panel>
              <Background gap={28} size={1} className="!bg-transparent" color="var(--border)" />
              <Controls className="!border-border !bg-card/95 !shadow-md" />
              <MiniMap
                className="!border-border !bg-card/90"
                nodeColor={(n) => (n.type === 'exploreReport' ? 'var(--primary)' : 'var(--accent)')}
                maskColor="oklch(0.2 0.02 280 / 0.12)"
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
      ) : fullNodes.length === 0 ? (
        <div className="border-border/70 text-muted-foreground rounded-2xl border border-dashed px-6 py-16 text-center text-sm">
          No rows to show.
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
                      <Badge variant={row.type === 'report' ? 'default' : 'secondary'} className="rounded-md capitalize">
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

      {view === 'table' && fullNodes.length > 0 ? (
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
