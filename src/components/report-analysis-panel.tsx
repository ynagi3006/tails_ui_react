import { type ReactNode, useCallback, useRef, useState } from 'react'
import { ChevronDownIcon, RefreshCwIcon, SparklesIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  extractAssistantText,
  postReportAnalysis,
  type ReportAnalysisPayload,
} from '@/lib/agent-chat-api'
import { cn } from '@/lib/utils'

import { type Block, parseBlocks, renderInlineMarkdown } from '@/lib/markdown-render'

function isSummaryHeading(text: string): boolean {
  return /overall|assessment|summary|takeaway|conclusion|key focus/i.test(text)
}

function renderBlock(block: Block, i: number, blocks: Block[]): ReactNode {
  switch (block.type) {
    case 'heading':
      if (block.level === 1)
        return (
          <h3 key={i} className="mt-1 mb-2 text-base font-bold tracking-tight text-foreground first:mt-0">
            {block.text}
          </h3>
        )
      return (
        <h4
          key={i}
          className={cn(
            'mb-1.5 text-[13.5px] font-semibold text-foreground',
            i > 0 && 'mt-5 border-t border-border/40 pt-4',
          )}
        >
          {block.text}
        </h4>
      )
    case 'hr':
      return <hr key={i} className="my-4 border-border/40" />
    case 'bullets':
      return (
        <ul key={i} className="my-1.5 space-y-1 pl-5">
          {block.items.map((item, j) => (
            <li key={j} className="list-disc pl-0.5 marker:text-muted-foreground/50">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      )
    case 'numbered':
      return (
        <ol key={i} className="my-1.5 space-y-1 pl-5 list-decimal">
          {block.items.map((item, j) => (
            <li key={j} className="pl-0.5 marker:text-muted-foreground/60 marker:font-medium">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ol>
      )
    case 'paragraph':
      return <p key={i} className="my-1.5">{renderInlineMarkdown(block.text)}</p>
  }
}

function AnalysisText({ text }: { text: string }) {
  const blocks = parseBlocks(text)
  const rendered: ReactNode[] = []
  let i = 0

  while (i < blocks.length) {
    const block = blocks[i]

    if (block.type === 'heading' && isSummaryHeading(block.text)) {
      const children: ReactNode[] = []
      children.push(
        <h4 key={`sh-${i}`} className="mb-2 text-sm font-bold tracking-tight text-foreground">
          {block.text}
        </h4>,
      )
      let j = i + 1
      while (j < blocks.length && blocks[j].type !== 'heading' && blocks[j].type !== 'hr') {
        children.push(renderBlock(blocks[j], j, blocks))
        j++
      }
      rendered.push(
        <div
          key={`sum-${i}`}
          className="mt-5 rounded-xl border border-border/50 bg-muted/30 px-5 py-4"
        >
          {children}
        </div>,
      )
      i = j
      continue
    }

    rendered.push(renderBlock(block, i, blocks))
    i++
  }

  return (
    <div className="space-y-1 text-[13.5px] leading-[1.7] text-foreground/90">
      {rendered}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Report analysis panel                                             */
/* ------------------------------------------------------------------ */

type Props = {
  reportId: string
  reportName?: string
  renderedHtml?: string
  editionId?: string
  reportVersionId?: string
  metricsUsed?: string[]
}

export function ReportAnalysisPanel({ reportId, reportName, renderedHtml, editionId, reportVersionId, metricsUsed }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fetchedForRef = useRef<string | null>(null)
  const cancelRef = useRef(0)

  // Reset when edition changes
  const cacheKey = `${reportId}:${editionId ?? 'live'}`
  if (fetchedForRef.current && fetchedForRef.current !== cacheKey) {
    fetchedForRef.current = null
    setAnalysis(null)
    setError(null)
  }

  const runAnalysis = useCallback((forceRefresh = false) => {
    if (!forceRefresh && fetchedForRef.current === cacheKey && analysis) return

    const id = ++cancelRef.current
    setLoading(true)
    setAnalysis(null)
    setError(null)
    fetchedForRef.current = cacheKey

    const payload: ReportAnalysisPayload = {
      report_id: reportId,
      report_name: reportName,
      rendered_html: renderedHtml,
      edition_id: editionId,
      report_version_id: reportVersionId,
      metrics_used: metricsUsed,
      force_refresh: forceRefresh,
    }

    postReportAnalysis(payload)
      .then((res) => {
        if (cancelRef.current !== id) return
        setAnalysis(extractAssistantText(res) || 'No analysis available.')
      })
      .catch((err) => {
        if (cancelRef.current !== id) return
        fetchedForRef.current = null
        setError(err instanceof Error ? err.message : 'Analysis failed')
      })
      .finally(() => {
        if (cancelRef.current === id) setLoading(false)
      })
  }, [reportId, reportName, renderedHtml, editionId, reportVersionId, metricsUsed, analysis, cacheKey])

  const handleToggle = () => {
    const willOpen = !open
    setOpen(willOpen)
    if (willOpen && fetchedForRef.current !== cacheKey) {
      runAnalysis()
    }
  }

  const handleRefresh = () => {
    runAnalysis(true)
  }

  return (
    <div className="border-border/70 bg-card/50 rounded-2xl border shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5">
        {open && (analysis || error) && !loading && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0"
            title="Regenerate analysis"
            onClick={handleRefresh}
          >
            <RefreshCwIcon className="size-3.5" />
          </Button>
        )}
        <button
          type="button"
          onClick={handleToggle}
          className="flex flex-1 items-center gap-2.5 min-w-0 text-left hover:opacity-80 transition-opacity"
        >
          <SparklesIcon className="size-4 shrink-0 text-indigo-500" />
          <span className="text-sm font-semibold">AI Report Analysis</span>
          {loading && (
            <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-indigo-400 border-t-transparent" />
          )}
          {analysis && !loading && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
              Ready
            </span>
          )}
        </button>
        <button type="button" onClick={handleToggle} className="shrink-0 p-0.5 hover:opacity-80 transition-opacity">
          <ChevronDownIcon
            className={cn(
              'size-4 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </button>
      </div>

      {open && (
        <div className="border-t border-border/60 animate-in slide-in-from-top-1 fade-in-0 duration-150">
          <div className="max-h-[min(70vh,800px)] overflow-y-auto px-6 py-5">
            {loading && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Analysing {metricsUsed?.length ? `${metricsUsed.length} metrics across the report` : 'report'}…
                </div>
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            )}
            {error && !loading && (
              <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                <p className="text-sm text-destructive flex-1">{error}</p>
                <Button variant="outline" size="sm" className="shrink-0 h-7 text-xs" onClick={handleRefresh}>
                  Retry
                </Button>
              </div>
            )}
            {analysis && !loading && (
              <div className="max-w-none">
                <AnalysisText text={analysis} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
