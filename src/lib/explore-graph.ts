import { Position, type Edge, type Node } from '@xyflow/react'

export type ExploreApiNode = {
  id: string
  type: 'report' | 'metric'
  name: string
  tags: string[]
  owned_by?: string
  metric_count?: number
  datapoint_count?: number
  dimensions?: string[]
}

export type ExploreApiEdge = { source: string; target: string }

export const REPORT_W = 228
export const REPORT_H = 58
export const METRIC_W = 196
export const METRIC_H = 46

const GOLDEN_ANGLE = 2.39996322972865332

/** Classic explore: fuzzy subsequence match on tag characters (case-insensitive). */
export function tagMatchesSearch(tag: string, search: string): boolean {
  if (!search) return true
  const t = tag.toLowerCase()
  const s = search.toLowerCase()
  if (t.includes(s)) return true
  let i = 0
  for (let j = 0; j < t.length && i < s.length; j++) {
    if (t[j] === s[i]) i++
  }
  return i === s.length
}

export function parseExploreGraph(data: unknown): { nodes: ExploreApiNode[]; edges: ExploreApiEdge[] } {
  if (!data || typeof data !== 'object') return { nodes: [], edges: [] }
  const d = data as Record<string, unknown>
  const rawNodes = d.nodes
  const rawEdges = d.edges
  const nodes: ExploreApiNode[] = []
  if (Array.isArray(rawNodes)) {
    for (const raw of rawNodes) {
      if (!raw || typeof raw !== 'object') continue
      const r = raw as Record<string, unknown>
      const id = String(r.id ?? '').trim()
      const t = r.type === 'metric' ? 'metric' : 'report'
      if (!id) continue
      const tagsRaw = r.tags
      const tags = Array.isArray(tagsRaw) ? (tagsRaw as unknown[]).map(String) : []
      nodes.push({
        id,
        type: t,
        name: String(r.name ?? 'Unnamed').trim() || 'Unnamed',
        tags,
        owned_by: r.owned_by != null ? String(r.owned_by) : undefined,
        metric_count: typeof r.metric_count === 'number' ? r.metric_count : undefined,
        datapoint_count: typeof r.datapoint_count === 'number' ? r.datapoint_count : undefined,
        dimensions: Array.isArray(r.dimensions) ? (r.dimensions as unknown[]).map(String) : undefined,
      })
    }
  }
  const edges: ExploreApiEdge[] = []
  if (Array.isArray(rawEdges)) {
    for (const raw of rawEdges) {
      if (!raw || typeof raw !== 'object') continue
      const e = raw as Record<string, unknown>
      const source = String(e.source ?? '').trim()
      const target = String(e.target ?? '').trim()
      if (source && target) edges.push({ source, target })
    }
  }
  return { nodes, edges }
}

/** Nodes whose tags match + neighbors on an edge (classic behavior). */
function nodeIdsMatchingTagFilter(nodes: ExploreApiNode[], edges: ExploreApiEdge[], tagSearch: string): Set<string> {
  const s = tagSearch.trim()
  if (!s) return new Set(nodes.map((n) => n.id))
  const tagged = new Set<string>()
  for (const n of nodes) {
    if (n.tags.some((t) => tagMatchesSearch(t, s))) tagged.add(n.id)
  }
  const expanded = new Set(tagged)
  for (const e of edges) {
    if (tagged.has(e.source) || tagged.has(e.target)) {
      expanded.add(e.source)
      expanded.add(e.target)
    }
  }
  return expanded
}

/** Selected node and its immediate neighbors only (classic graph click). */
function neighborOneHop(edges: ExploreApiEdge[], nodeId: string): Set<string> {
  const ids = new Set<string>([nodeId])
  for (const e of edges) {
    if (e.source === nodeId || e.target === nodeId) {
      ids.add(e.source)
      ids.add(e.target)
    }
  }
  return ids
}

export function visibleExploreSubgraph(
  nodes: ExploreApiNode[],
  edges: ExploreApiEdge[],
  tagSearch: string,
  focusNodeId: string | null,
): { nodes: ExploreApiNode[]; edges: ExploreApiEdge[] } {
  const tagSet = nodeIdsMatchingTagFilter(nodes, edges, tagSearch)
  const hopSet = focusNodeId ? neighborOneHop(edges, focusNodeId) : null

  let ids: Set<string>
  if (hopSet && tagSearch.trim()) {
    ids = new Set([...hopSet].filter((id) => tagSet.has(id)))
  } else if (hopSet) {
    ids = hopSet
  } else {
    ids = tagSet
  }

  const n = nodes.filter((x) => ids.has(x.id))
  const e = edges.filter((x) => ids.has(x.source) && ids.has(x.target))
  return { nodes: n, edges: e }
}

function nodeBox(n: ExploreApiNode): { w: number; h: number } {
  return n.type === 'report' ? { w: REPORT_W, h: REPORT_H } : { w: METRIC_W, h: METRIC_H }
}

function outwardCardinal(px: number, py: number, cx: number, cy: number): Position {
  const dx = px - cx
  const dy = py - cy
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return Position.Bottom
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? Position.Right : Position.Left) : dy >= 0 ? Position.Bottom : Position.Top
}

function oppositePosition(p: Position): Position {
  switch (p) {
    case Position.Top:
      return Position.Bottom
    case Position.Bottom:
      return Position.Top
    case Position.Left:
      return Position.Right
    case Position.Right:
      return Position.Left
    default:
      return Position.Top
  }
}

/**
 * Hub layout: reports clustered at the center, metrics on an outer shell.
 * Metrics tied to several reports use the centroid of those reports so shared metrics sit between them.
 * Edges are still report → metric (metrics can fan to multiple reports).
 */
export function layoutExploreFlow(
  nodes: ExploreApiNode[],
  edges: ExploreApiEdge[],
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [], edges: [] }

  const CX = 0
  const CY = 0

  const reports = nodes.filter((n) => n.type === 'report')
  const metrics = nodes.filter((n) => n.type === 'metric')

  const reportPos = new Map<string, { x: number; y: number }>()
  const metricPos = new Map<string, { x: number; y: number }>()
  const nR = reports.length

  const metricsOnly = nR === 0 && metrics.length > 0

  if (metricsOnly) {
    const R = 320
    metrics.forEach((m, i) => {
      const t = (2 * Math.PI * i) / metrics.length - Math.PI / 2
      metricPos.set(m.id, { x: CX + R * Math.cos(t), y: CY + R * Math.sin(t) })
    })
  } else if (nR === 1) {
    reportPos.set(reports[0].id, { x: CX, y: CY })
  } else if (nR >= 2) {
    const RInner = Math.max(96, 48 + 52 * Math.sqrt(nR))
    reports.forEach((r, i) => {
      const t = (2 * Math.PI * i) / nR - Math.PI / 2
      reportPos.set(r.id, { x: CX + RInner * Math.cos(t), y: CY + RInner * Math.sin(t) })
    })
  }

  const metricToReports = new Map<string, string[]>()
  for (const e of edges) {
    if (!metricToReports.has(e.target)) metricToReports.set(e.target, [])
    metricToReports.get(e.target)!.push(e.source)
  }

  const ROuterBase =
    nR === 0
      ? 0
      : nR === 1
        ? 240
        : Math.max(220, 140 + 36 * Math.sqrt(nR) + 28 * Math.sqrt(metrics.length))

  if (!metricsOnly) {
    metrics.forEach((m, idx) => {
      const rids = [...new Set(metricToReports.get(m.id) ?? [])].filter((id) => reportPos.has(id))
      let vx = 0
      let vy = 0
      if (rids.length === 0) {
        const t = GOLDEN_ANGLE * idx
        vx = Math.cos(t)
        vy = Math.sin(t)
      } else {
        let sx = 0
        let sy = 0
        for (const rid of rids) {
          const p = reportPos.get(rid)!
          sx += p.x
          sy += p.y
        }
        sx /= rids.length
        sy /= rids.length
        vx = sx - CX
        vy = sy - CY
        const L = Math.hypot(vx, vy)
        if (L < 1e-6) {
          const t = GOLDEN_ANGLE * idx
          vx = Math.cos(t)
          vy = Math.sin(t)
        } else {
          vx /= L
          vy /= L
        }
      }
      const ring = Math.floor(idx / 8)
      const dist = ROuterBase + ring * 72 + (idx % 3) * 22
      metricPos.set(m.id, { x: CX + vx * dist, y: CY + vy * dist })
    })

    const METRIC_MIN = 108
    for (let iter = 0; iter < 24; iter++) {
      for (let i = 0; i < metrics.length; i++) {
        for (let j = i + 1; j < metrics.length; j++) {
          const a = metricPos.get(metrics[i].id)!
          const b = metricPos.get(metrics[j].id)!
          let ddx = b.x - a.x
          let ddy = b.y - a.y
          let d = Math.hypot(ddx, ddy)
          if (d < 1e-6) {
            ddx = Math.cos(GOLDEN_ANGLE * (i + j))
            ddy = Math.sin(GOLDEN_ANGLE * (i + j))
            d = 1
          }
          if (d < METRIC_MIN) {
            const push = (METRIC_MIN - d) * 0.52
            const ux = ddx / d
            const uy = ddy / d
            a.x -= ux * push
            a.y -= uy * push
            b.x += ux * push
            b.y += uy * push
          }
        }
      }
    }
  }

  const rfNodes: Node[] = []

  for (const n of nodes) {
    const { w, h } = nodeBox(n)
    let cx: number
    let cy: number
    if (n.type === 'report') {
      const p = reportPos.get(n.id)
      if (!p) continue
      cx = p.x
      cy = p.y
      const sourceHandle = outwardCardinal(cx, cy, CX, CY)
      rfNodes.push({
        id: n.id,
        type: 'exploreReport',
        position: { x: cx - w / 2, y: cy - h / 2 },
        data: { label: n.name, raw: n, sourceHandle },
      })
    } else {
      const p = metricPos.get(n.id)
      if (!p) continue
      cx = p.x
      cy = p.y
      const outM = outwardCardinal(cx, cy, CX, CY)
      const targetHandle = oppositePosition(outM)
      rfNodes.push({
        id: n.id,
        type: 'exploreMetric',
        position: { x: cx - w / 2, y: cy - h / 2 },
        data: { label: n.name, raw: n, targetHandle },
      })
    }
  }

  const rfEdges: Edge[] = edges.map((e, i) => ({
    id: `e-${e.source}-${e.target}-${i}`,
    source: e.source,
    target: e.target,
    type: 'default',
    animated: true,
    style: {
      stroke: 'var(--primary)',
      strokeOpacity: 0.35,
      strokeWidth: 1.5,
    },
  }))

  return { nodes: rfNodes, edges: rfEdges }
}
