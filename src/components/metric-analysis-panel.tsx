import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { SearchIcon, SparklesIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  extractAssistantText,
  postMetricAnalysis,
  type MetricAnalysisPayload,
} from '@/lib/agent-chat-api'
import type { MetricClickPayload } from '@/components/report-preview-frame'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Inline markdown renderer                                          */
/* ------------------------------------------------------------------ */

function renderInlineMarkdown(raw: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/
  let remaining = raw
  let key = 0
  while (remaining) {
    const match = re.exec(remaining)
    if (!match) {
      nodes.push(remaining)
      break
    }
    if (match.index > 0) nodes.push(remaining.slice(0, match.index))
    const [full, , boldItalic, bold, italic, code] = match
    if (boldItalic)
      nodes.push(<strong key={key} className="font-semibold"><em>{boldItalic}</em></strong>)
    else if (bold)
      nodes.push(<strong key={key} className="font-semibold">{bold}</strong>)
    else if (italic)
      nodes.push(<em key={key}>{italic}</em>)
    else if (code)
      nodes.push(<code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{code}</code>)
    key++
    remaining = remaining.slice(match.index + full.length)
  }
  return nodes
}

function AnalysisText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/)
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {paragraphs.map((p, i) => {
        const lines = p.split('\n')
        const isBulletList = lines.every((l) => /^\s*[-*•]\s/.test(l) || !l.trim())
        if (isBulletList) {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5">
              {lines
                .filter((l) => l.trim())
                .map((l, j) => (
                  <li key={j}>{renderInlineMarkdown(l.replace(/^\s*[-*•]\s*/, ''))}</li>
                ))}
            </ul>
          )
        }
        return <p key={i}>{renderInlineMarkdown(p)}</p>
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Shared fetch hook                                                 */
/* ------------------------------------------------------------------ */

function useMetricAnalysis(target: MetricClickPayload | null, reportName: string | undefined, detailed: boolean) {
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(0)

  const fetch = useCallback(() => {
    if (!target) return
    const id = ++cancelRef.current
    setLoading(true)
    setAnalysis(null)
    setError(null)

    const payload: MetricAnalysisPayload = {
      metric_name: target.metricName || target.rowContext || 'Unknown metric',
      value: target.value,
      column_header: target.columnHeader || undefined,
      row_context: target.rowContext || undefined,
      report_name: reportName || undefined,
      detailed,
      column_dates: target.columnDates,
      row_values: target.rowValues,
    }

    postMetricAnalysis(payload)
      .then((res) => {
        if (cancelRef.current !== id) return
        setAnalysis(extractAssistantText(res) || 'No analysis available.')
      })
      .catch((err) => {
        if (cancelRef.current !== id) return
        setError(err instanceof Error ? err.message : 'Analysis failed')
      })
      .finally(() => {
        if (cancelRef.current === id) setLoading(false)
      })
  }, [target, reportName, detailed])

  useEffect(() => {
    fetch()
    return () => { cancelRef.current++ }
  }, [fetch])

  return { loading, analysis, error }
}

/* ------------------------------------------------------------------ */
/*  Quick analysis — bottom drawer pinned to viewport                 */
/* ------------------------------------------------------------------ */

type QuickProps = {
  target: MetricClickPayload
  reportName?: string
  onClose: () => void
  onDetailedClick: () => void
}

export function QuickAnalysisPopup({ target, reportName, onClose, onDetailedClick }: QuickProps) {
  const { loading, analysis, error } = useMetricAnalysis(target, reportName, false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50',
        'animate-in slide-in-from-bottom-4 fade-in-0 duration-200',
      )}
    >
      <div className="mx-auto max-w-3xl px-4 pb-4">
        <div className="rounded-xl border border-border/70 bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <SparklesIcon className="size-4 shrink-0 text-indigo-500" />
              <span className="truncate text-sm font-semibold">
                {target.metricName || target.rowContext || 'Metric'}
              </span>
              <Badge variant="secondary" className="shrink-0 text-[10px]">Quick</Badge>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {analysis && !loading && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 rounded-lg text-xs"
                  onClick={onDetailedClick}
                >
                  <SearchIcon className="size-3" />
                  Detailed Analysis
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" className="size-7" onClick={onClose}>
                <XIcon className="size-4" />
              </Button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[min(45vh,400px)] overflow-y-auto px-4 py-3">
            {loading && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Analysing {target.metricName || 'metric'}…
                </div>
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-5/6" />
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            {analysis && !loading && <AnalysisText text={analysis} />}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Detailed analysis card — inline below the report                  */
/* ------------------------------------------------------------------ */

type DetailedProps = {
  target: MetricClickPayload
  reportName?: string
  onClose: () => void
}

export function DetailedAnalysisCard({ target, reportName, onClose }: DetailedProps) {
  const { loading, analysis, error } = useMetricAnalysis(target, reportName, true)

  return (
    <div className="border-border/70 bg-card animate-in slide-in-from-bottom-2 fade-in-0 rounded-2xl border shadow-sm duration-200">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <SearchIcon className="size-4 text-indigo-500" />
            Detailed Analysis
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              {target.metricName || target.rowContext || '—'}
            </Badge>
            <span className="text-muted-foreground text-xs italic">Deep dive</span>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={onClose}>
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      <div className="max-h-[min(60vh,640px)] overflow-y-auto px-4 py-3">
        {loading && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Running deep-dive analysis — pulling all available data…
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}
        {analysis && !loading && <AnalysisText text={analysis} />}
      </div>
    </div>
  )
}
