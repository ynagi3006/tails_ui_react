import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeftIcon,
  CalendarIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  FileCode2Icon,
  LayoutGridIcon,
  RefreshCwIcon,
  SaveIcon,
  Settings2Icon,
  SparklesIcon,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { DataTableCard } from '@/components/data-table-card'
import { MonacoField } from '@/components/monaco-field'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { DetailedAnalysisCard, QuickAnalysisPopup } from '@/components/metric-analysis-panel'
import { ReportPreviewFrame, type MetricClickPayload } from '@/components/report-preview-frame'
import { apiFetchJson, getClassicUiReportUrl } from '@/lib/api'
import { formatDate, formatDateOnly } from '@/lib/format-date'
import { useTheme } from '@/hooks/use-theme'
import { useHtmlBlobUrl } from '@/lib/html-blob-url'
import { cn } from '@/lib/utils'

type RenderedReport = {
  report_id: string
  report_name: string
  html: string
  rendered_at: string
  metrics_used: string[]
}

type ReportDetail = Record<string, unknown>

type EditionRow = {
  id: string
  report_id: string
  dimensions: Record<string, string>
  common_date?: string
  created_at?: string
}

type PageTab = 'preview' | 'template' | 'details'

function parseEditionList(data: unknown): EditionRow[] {
  if (!Array.isArray(data)) return []
  return data.map((raw) => {
    const e = raw as Record<string, unknown>
    const dims = e.dimensions
    return {
      id: String(e.id ?? ''),
      report_id: String(e.report_id ?? ''),
      dimensions: dims && typeof dims === 'object' && !Array.isArray(dims) ? (dims as Record<string, string>) : {},
      common_date: e.common_date != null ? String(e.common_date) : undefined,
      created_at: e.created_at != null ? String(e.created_at) : undefined,
    }
  })
}

function pickTags(r: Record<string, unknown>): string[] {
  const t = r.tags
  return Array.isArray(t) ? (t as unknown[]).map(String) : []
}

function reportVersionIdFromReport(r: ReportDetail | null): string {
  if (!r) return ''
  return String(r.report_version_id ?? r.reportVersionId ?? '')
}

export function ReportViewPage() {
  const { reportId = '' } = useParams<{ reportId: string }>()
  const { resolved: themeResolved } = useTheme()
  const [pageTab, setPageTab] = useState<PageTab>('preview')
  const [mode, setMode] = useState<'live' | 'editions'>('live')

  const [report, setReport] = useState<ReportDetail | null>(null)
  const [rendered, setRendered] = useState<RenderedReport | null>(null)
  const [editions, setEditions] = useState<EditionRow[]>([])
  const [selectedEditionId, setSelectedEditionId] = useState<string | null>(null)
  const [editionHtml, setEditionHtml] = useState<string | null>(null)
  const [editionLoading, setEditionLoading] = useState(false)

  const [loadingMeta, setLoadingMeta] = useState(true)
  const [loadingLive, setLoadingLive] = useState(true)
  const [loadingEditions, setLoadingEditions] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editionsError, setEditionsError] = useState<string | null>(null)

  const [templateDraft, setTemplateDraft] = useState('')
  const [templateBaseline, setTemplateBaseline] = useState('')
  const [templateLoading, setTemplateLoading] = useState(false)
  const [templateReady, setTemplateReady] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)

  const [detailName, setDetailName] = useState('')
  const [detailDesc, setDetailDesc] = useState('')
  const [detailTags, setDetailTags] = useState('')
  const [detailStatus, setDetailStatus] = useState<'draft' | 'published' | 'archived'>('draft')
  const [detailPublish, setDetailPublish] = useState<'LATE_MORNING' | 'LATE_AFTERNOON' | ''>('')
  const [savingDetails, setSavingDetails] = useState(false)

  const [actionMsg, setActionMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const [quickTarget, setQuickTarget] = useState<MetricClickPayload | null>(null)
  const [detailedTarget, setDetailedTarget] = useState<MetricClickPayload | null>(null)
  const prevReportVersionIdRef = useRef<string>('')

  const liveIframeUrl = useHtmlBlobUrl(rendered?.html, { theme: themeResolved })
  const editionIframeUrl = useHtmlBlobUrl(editionHtml, { theme: themeResolved })

  const reportVersionId = reportVersionIdFromReport(report)

  const loadReport = useCallback(async () => {
    if (!reportId) return
    try {
      const r = await apiFetchJson<ReportDetail>(`/reports/${encodeURIComponent(reportId)}`)
      setReport(r)
    } catch {
      setReport(null)
    }
  }, [reportId])

  const loadLive = useCallback(async () => {
    if (!reportId) return
    setLoadingLive(true)
    setError(null)
    try {
      const data = await apiFetchJson<RenderedReport>(`/reports/${encodeURIComponent(reportId)}/render`)
      setRendered(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to render report')
      setRendered(null)
    } finally {
      setLoadingLive(false)
    }
  }, [reportId])

  const loadEditions = useCallback(async () => {
    if (!reportId) return
    setLoadingEditions(true)
    setEditionsError(null)
    try {
      const sp = new URLSearchParams({
        report_id: reportId,
        limit: '100',
        sort: 'created_at:desc',
      })
      const data = await apiFetchJson<unknown>(`/edition/search?${sp.toString()}`)
      const list = parseEditionList(data)
      setEditions(list)
      setSelectedEditionId((cur) => {
        if (cur && list.some((x) => x.id === cur)) return cur
        return list[0]?.id ?? null
      })
    } catch (e) {
      setEditionsError(e instanceof Error ? e.message : 'Failed to load editions')
      setEditions([])
    } finally {
      setLoadingEditions(false)
    }
  }, [reportId])

  const fetchTemplate = useCallback(async () => {
    if (!reportVersionId) return
    setTemplateLoading(true)
    setActionMsg(null)
    try {
      const d = await apiFetchJson<{ template: string }>(
        `/reports/version/${encodeURIComponent(reportVersionId)}/template`,
      )
      const t = d.template ?? ''
      setTemplateDraft(t)
      setTemplateBaseline(t)
      setTemplateReady(true)
    } catch {
      setTemplateDraft('')
      setTemplateBaseline('')
      setTemplateReady(true)
      setActionMsg({
        text: 'Could not load template (none stored yet, or S3 error). You can still paste Jinja and save.',
        error: true,
      })
    } finally {
      setTemplateLoading(false)
    }
  }, [reportVersionId])

  useEffect(() => {
    if (!reportVersionId) {
      setTemplateReady(false)
      setTemplateDraft('')
      setTemplateBaseline('')
      prevReportVersionIdRef.current = ''
      return
    }
    if (prevReportVersionIdRef.current !== reportVersionId) {
      prevReportVersionIdRef.current = reportVersionId
      setTemplateReady(false)
      setTemplateDraft('')
      setTemplateBaseline('')
    }
  }, [reportVersionId])

  useEffect(() => {
    if (pageTab !== 'template' || !reportVersionId || templateReady) return
    void fetchTemplate()
  }, [pageTab, reportVersionId, templateReady, fetchTemplate])

  useEffect(() => {
    if (!reportId) return
    let cancelled = false
    ;(async () => {
      setLoadingMeta(true)
      await loadReport()
      if (!cancelled) setLoadingMeta(false)
    })()
    return () => {
      cancelled = true
    }
  }, [reportId, loadReport])

  useEffect(() => {
    void loadLive()
  }, [loadLive])

  useEffect(() => {
    if (mode === 'editions') void loadEditions()
  }, [mode, loadEditions])

  useEffect(() => {
    if (!selectedEditionId || mode !== 'editions') {
      setEditionHtml(null)
      return
    }
    let cancelled = false
    setEditionLoading(true)
    setEditionHtml(null)
    void (async () => {
      try {
        const ed = await apiFetchJson<Record<string, unknown>>(`/edition/${encodeURIComponent(selectedEditionId)}`)
        const html =
          typeof ed.content === 'string' ? ed.content : typeof ed.html === 'string' ? (ed.html as string) : ''
        if (!cancelled) setEditionHtml(html || null)
      } catch {
        if (!cancelled) setEditionHtml(null)
      } finally {
        if (!cancelled) setEditionLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedEditionId, mode])

  useEffect(() => {
    if (!report) return
    setDetailName(String(report.report_name ?? report.title ?? ''))
    setDetailDesc(String(report.description ?? ''))
    setDetailTags(pickTags(report).join(', '))
    const st = String(report.status ?? 'draft').toLowerCase()
    if (st === 'published' || st === 'archived' || st === 'draft') {
      setDetailStatus(st)
    } else {
      setDetailStatus('draft')
    }
    const pw = String(report.publish_window ?? '')
    if (pw === 'LATE_MORNING' || pw === 'LATE_AFTERNOON') setDetailPublish(pw)
    else setDetailPublish('')
  }, [report])

  const refreshAll = () => {
    void loadReport()
    void loadLive()
    if (mode === 'editions') void loadEditions()
  }

  const saveTemplate = async () => {
    if (!reportVersionId) return
    const t = templateDraft.trim()
    if (!t) {
      setActionMsg({ text: 'Template cannot be empty.', error: true })
      return
    }
    setSavingTemplate(true)
    setActionMsg(null)
    try {
      await apiFetchJson(`/reports/version/${encodeURIComponent(reportVersionId)}/template`, {
        method: 'PUT',
        body: JSON.stringify({ template: t }),
      })
      setTemplateBaseline(t)
      setActionMsg({ text: 'Template saved to this report version (in place).' })
      await loadReport()
      await loadLive()
    } catch (e) {
      setActionMsg({ text: e instanceof Error ? e.message : 'Save failed', error: true })
    } finally {
      setSavingTemplate(false)
    }
  }

  const saveDetails = async () => {
    if (!reportId) return
    if (!detailPublish) {
      setActionMsg({ text: 'Publish window is required.', error: true })
      return
    }
    setSavingDetails(true)
    setActionMsg(null)
    try {
      const tags = detailTags
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
      const updated = await apiFetchJson<ReportDetail>(`/reports/${encodeURIComponent(reportId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          report_name: detailName.trim(),
          description: detailDesc.trim() || null,
          tags,
          status: detailStatus,
          publish_window: detailPublish,
        }),
      })
      setReport(updated)
      setActionMsg({ text: 'Report details saved.' })
      await loadLive()
    } catch (e) {
      setActionMsg({ text: e instanceof Error ? e.message : 'Save failed', error: true })
    } finally {
      setSavingDetails(false)
    }
  }

  const classic = getClassicUiReportUrl(reportId)
  const reportName =
    (rendered?.report_name ||
      (report ? String(report.report_name ?? report.title ?? '') : '') ||
      (loadingMeta || loadingLive ? 'Loading…' : 'Report')) as string
  const reportDesc = report ? String(report.description ?? '') : ''
  const tags = report ? pickTags(report) : []
  const status = report ? String(report.status ?? '') : ''
  const publishWindow = report ? String(report.publish_window ?? '') : ''
  const versionId = report ? String(report.version_id ?? '') : ''
  const latestCommon = report
    ? (report.latest_edition_common_date ?? report.latestEditionCommonDate) != null
      ? String(report.latest_edition_common_date ?? report.latestEditionCommonDate)
      : ''
    : ''
  const latestCreated = report
    ? (report.latest_edition_created_at ?? report.latestEditionCreatedAt) != null
      ? String(report.latest_edition_created_at ?? report.latestEditionCreatedAt)
      : ''
    : ''

  const handleMetricClick = useCallback((payload: MetricClickPayload) => {
    setQuickTarget(payload)
    setDetailedTarget(null)
  }, [])

  const activeIframeUrl = mode === 'live' ? liveIframeUrl : editionIframeUrl
  const previewLoading = mode === 'live' ? loadingLive : editionLoading

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5 rounded-lg" asChild>
          <Link to="/reports">
            <ArrowLeftIcon className="size-4" />
            Reports
          </Link>
        </Button>
      </div>

      <div className="border-border/70 bg-card/50 rounded-2xl border p-5 shadow-sm sm:p-6">
        <PageHeader
          title={reportName}
          description={reportDesc || undefined}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={!reportId}
                onClick={() => refreshAll()}
              >
                <RefreshCwIcon className="size-3.5" />
                Refresh
              </Button>
              {classic ? (
                <Button size="sm" className="gap-1.5 rounded-xl" asChild>
                  <a href={classic} target="_blank" rel="noreferrer">
                    Classic UI
                    <ExternalLinkIcon className="size-3.5 opacity-80" />
                  </a>
                </Button>
              ) : null}
            </div>
          }
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {status ? (
            <Badge variant="secondary" className="rounded-md capitalize">
              {status.replace(/_/g, ' ')}
            </Badge>
          ) : null}
          {publishWindow ? (
            <Badge variant="outline" className="rounded-md font-normal">
              {publishWindow.replace(/_/g, ' ')}
            </Badge>
          ) : null}
          {versionId ? (
            <span className="text-muted-foreground text-xs">Version {versionId}</span>
          ) : null}
          {reportVersionId ? (
            <span className="text-muted-foreground font-mono text-[0.65rem] break-all opacity-80">
              {reportVersionId}
            </span>
          ) : null}
        </div>

        {tags.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t} variant="outline" className="font-normal">
                {t}
              </Badge>
            ))}
          </div>
        ) : null}

        {(latestCommon || latestCreated) && (
          <div className="border-border/60 bg-muted/30 mt-4 flex flex-wrap gap-4 rounded-xl border px-4 py-3 text-sm">
            {latestCommon ? (
              <div className="flex items-center gap-2">
                <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
                <span>
                  <span className="text-muted-foreground">Latest edition date </span>
                  <span className="text-foreground font-medium">{formatDateOnly(latestCommon)}</span>
                </span>
              </div>
            ) : null}
            {latestCreated ? (
              <div className="text-muted-foreground">
                Uploaded <span className="text-foreground font-medium">{formatDate(latestCreated)}</span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="border-border/60 bg-muted/25 flex flex-wrap gap-1 rounded-full border p-1">
        {(
          [
            ['preview', 'Preview', LayoutGridIcon],
            ['template', 'Jinja template', FileCode2Icon],
            ['details', 'Report details', Settings2Icon],
          ] as const
        ).map(([id, label, Icon]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={pageTab === id ? 'secondary' : 'ghost'}
            className="h-9 rounded-full px-4"
            onClick={() => setPageTab(id)}
          >
            <Icon className="mr-1.5 size-3.5 opacity-80" />
            {label}
          </Button>
        ))}
      </div>

      {actionMsg ? (
        <p className={cn('text-sm', actionMsg.error ? 'text-destructive' : 'text-muted-foreground')} role="status">
          {actionMsg.text}
        </p>
      ) : null}

      {pageTab === 'template' ? (
        <Card className="border-border/70 rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Jinja2 template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!reportVersionId ? (
              <p className="text-muted-foreground text-sm">Load the report first to edit its template.</p>
            ) : templateLoading ? (
              <Skeleton className="h-[min(48vh,520px)] w-full rounded-xl" />
            ) : (
              <MonacoField language="html" value={templateDraft} onChange={setTemplateDraft} showCopyButton />
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="rounded-xl"
                disabled={!reportVersionId || savingTemplate || templateLoading}
                onClick={() => void saveTemplate()}
              >
                <SaveIcon className="size-3.5" />
                {savingTemplate ? 'Saving…' : 'Save template'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={templateLoading}
                onClick={() => {
                  setTemplateDraft(templateBaseline)
                  setActionMsg({ text: 'Reverted to last loaded template.' })
                }}
              >
                Discard changes
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
                disabled={!reportVersionId || templateLoading}
                onClick={() => {
                  setTemplateReady(false)
                }}
              >
                Reload from server
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {pageTab === 'details' ? (
        <Card className="border-border/70 rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Report metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rv-name">Name</Label>
              <Input id="rv-name" value={detailName} onChange={(e) => setDetailName(e.target.value)} className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rv-desc">Description</Label>
              <Textarea id="rv-desc" value={detailDesc} onChange={(e) => setDetailDesc(e.target.value)} rows={3} className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rv-tags">Tags (comma-separated)</Label>
              <Input id="rv-tags" value={detailTags} onChange={(e) => setDetailTags(e.target.value)} className="rounded-lg" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <span className="text-sm font-medium">Status</span>
                <div className="flex flex-wrap gap-1.5">
                  {(['draft', 'published', 'archived'] as const).map((s) => (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant={detailStatus === s ? 'default' : 'outline'}
                      className="h-9 rounded-lg capitalize"
                      onClick={() => setDetailStatus(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium">Publish window</span>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={detailPublish === 'LATE_MORNING' ? 'secondary' : 'outline'}
                    className="h-10 rounded-lg"
                    onClick={() => setDetailPublish('LATE_MORNING')}
                  >
                    Late morning
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={detailPublish === 'LATE_AFTERNOON' ? 'secondary' : 'outline'}
                    className="h-10 rounded-lg"
                    onClick={() => setDetailPublish('LATE_AFTERNOON')}
                  >
                    Late afternoon
                  </Button>
                </div>
              </div>
            </div>
            <Button type="button" className="rounded-xl" disabled={savingDetails} onClick={() => void saveDetails()}>
              <SaveIcon className="size-3.5" />
              {savingDetails ? 'Saving…' : 'Save details'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {pageTab === 'preview' ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === 'live' ? 'default' : 'outline'}
              className="rounded-full"
              onClick={() => setMode('live')}
            >
              <SparklesIcon className="size-3.5" />
              Live render
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'editions' ? 'default' : 'outline'}
              className="rounded-full"
              onClick={() => setMode('editions')}
            >
              <CalendarIcon className="size-3.5" />
              Saved editions
            </Button>
          </div>

          {mode === 'live' && error ? (
            <div
              className="border-destructive/30 bg-destructive/5 text-destructive rounded-2xl border px-4 py-3 text-sm"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          {mode === 'editions' && editionsError ? (
            <div
              className="border-destructive/30 bg-destructive/5 text-destructive rounded-2xl border px-4 py-3 text-sm"
              role="alert"
            >
              {editionsError}
            </div>
          ) : null}

          <div
            className={cn(
              'grid gap-4',
              mode === 'editions' ? 'lg:grid-cols-[minmax(220px,280px)_1fr]' : 'grid-cols-1',
            )}
          >
            {mode === 'editions' ? (
              <Card className="border-border/70 h-fit max-h-[min(70vh,720px)] overflow-hidden rounded-2xl shadow-sm lg:sticky lg:top-24">
                <CardContent className="p-0">
                  <div className="border-border/60 bg-muted/20 border-b px-3 py-2.5 text-xs font-medium">
                    Editions ({editions.length})
                  </div>
                  {loadingEditions ? (
                    <div className="space-y-2 p-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : editions.length === 0 ? (
                    <p className="text-muted-foreground p-4 text-sm">No editions yet.</p>
                  ) : (
                    <ul className="max-h-[min(60vh,560px)] overflow-y-auto p-2">
                      {editions.map((ed) => {
                        const dimCount = Object.keys(ed.dimensions).length
                        const active = ed.id === selectedEditionId
                        return (
                          <li key={ed.id} className="mb-1">
                            <button
                              type="button"
                              onClick={() => setSelectedEditionId(ed.id)}
                              className={cn(
                                'border-border/60 hover:bg-muted/50 w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                                active && 'border-primary/40 bg-primary/5 ring-primary/20 ring-1',
                              )}
                            >
                              <div className="text-foreground font-medium">
                                {ed.common_date ? formatDateOnly(ed.common_date) : '—'}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                {ed.created_at ? formatDate(ed.created_at) : ''}
                                {dimCount ? ` · ${dimCount} dimension${dimCount === 1 ? '' : 's'}` : ''}
                              </div>
                              {dimCount ? (
                                <div className="mt-1.5 flex flex-wrap gap-0.5">
                                  {Object.entries(ed.dimensions)
                                    .slice(0, 4)
                                    .map(([k, v]) => (
                                      <Badge key={k} variant="secondary" className="font-mono text-[10px] font-normal">
                                        {k}={v}
                                      </Badge>
                                    ))}
                                  {dimCount > 4 ? (
                                    <span className="text-muted-foreground text-[10px]">+{dimCount - 4}</span>
                                  ) : null}
                                </div>
                              ) : null}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ) : null}

            <div className="min-w-0 space-y-3">
              {mode === 'live' && rendered?.metrics_used?.length ? (
                <details className="border-border/70 bg-muted/15 group rounded-xl border">
                  <summary className="hover:bg-muted/25 flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm select-none [&::-webkit-details-marker]:hidden">
                    <span>
                      <span className="text-muted-foreground font-medium">Metrics in template</span>
                      <span className="text-foreground ml-1.5 tabular-nums">({rendered.metrics_used.length})</span>
                    </span>
                    <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <div className="border-border/60 flex max-h-[min(40vh,280px)] flex-wrap gap-1.5 overflow-y-auto border-t px-3 py-2.5">
                    {rendered.metrics_used.map((m) => (
                      <Badge key={m} variant="secondary" className="font-normal">
                        {m}
                      </Badge>
                    ))}
                  </div>
                </details>
              ) : null}

              {mode === 'live' ? (
                <p className="text-muted-foreground text-xs">
                  Live view runs the current template against latest metric data (not necessarily the same as a stored
                  edition).
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Saved editions are HTML snapshots from publishing. Select one to preview.
                </p>
              )}

              <DataTableCard className="p-0">
                {activeIframeUrl && !previewLoading && (
                  <div className="flex items-center gap-1.5 border-b px-4 py-2 text-xs text-muted-foreground">
                    <SparklesIcon className="size-3 text-indigo-400" />
                    Click any metric name for an AI analysis
                  </div>
                )}
                {previewLoading ? (
                  <Skeleton className="h-[min(52vh,560px)] w-full rounded-none rounded-b-2xl" />
                ) : activeIframeUrl ? (
                  <ReportPreviewFrame
                    key={activeIframeUrl}
                    src={activeIframeUrl}
                    title={mode === 'live' ? 'Live rendered report' : 'Edition preview'}
                    onMetricClick={handleMetricClick}
                  />
                ) : mode === 'editions' && selectedEditionId ? (
                  <div className="text-muted-foreground flex h-[min(40vh,320px)] items-center justify-center px-6 text-sm">
                    This edition has no inline HTML (content may only exist in S3). Open the classic UI to view it.
                  </div>
                ) : (
                  <div className="text-muted-foreground flex h-[min(40vh,320px)] items-center justify-center text-sm">
                    Nothing to preview.
                  </div>
                )}
              </DataTableCard>

              {detailedTarget && (
                <DetailedAnalysisCard
                  target={detailedTarget}
                  reportName={reportName}
                  onClose={() => setDetailedTarget(null)}
                />
              )}
            </div>
          </div>
        </>
      ) : null}

      {quickTarget && (
        <QuickAnalysisPopup
          target={quickTarget}
          reportName={reportName}
          onClose={() => setQuickTarget(null)}
          onDetailedClick={() => {
            setDetailedTarget(quickTarget)
            setQuickTarget(null)
          }}
        />
      )}
    </div>
  )
}
