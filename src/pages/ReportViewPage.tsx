import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  ChevronLeftIcon,
  ChevronRightIcon,
  Trash2Icon,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { DataTableCard } from '@/components/data-table-card'
import { MonacoField } from '@/components/monaco-field'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { openChatWithPrompt } from '@/lib/agent-chat-widget-api'
import { EditionCalendar } from '@/components/edition-calendar'
import { ReportAnalysisPanel } from '@/components/report-analysis-panel'
import { ReportPreviewFrame, type MetricClickPayload } from '@/components/report-preview-frame'
import { apiFetchJson, getClassicUiReportUrl } from '@/lib/api'
import { formatDate, formatDateOnly } from '@/lib/format-date'
import { useHtmlBlobUrl } from '@/lib/html-blob-url'
import { cn } from '@/lib/utils'

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
  const navigate = useNavigate()
  const { reportId = '' } = useParams<{ reportId: string }>()
  const [pageTab, setPageTab] = useState<PageTab>('preview')

  const [report, setReport] = useState<ReportDetail | null>(null)
  const [editions, setEditions] = useState<EditionRow[]>([])
  const [selectedEditionId, setSelectedEditionId] = useState<string | null>(null)
  const [editionHtml, setEditionHtml] = useState<string | null>(null)
  const [editionLoading, setEditionLoading] = useState(false)

  const [loadingMeta, setLoadingMeta] = useState(true)
  const [loadingEditions, setLoadingEditions] = useState(true)
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
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const prevReportVersionIdRef = useRef<string>('')

  const [calendarOpen, setCalendarOpen] = useState(false)

  /* Edition HTML is authored for light/print; keep blob + iframe chrome off app theme (page chrome still follows theme). */
  const editionIframeUrl = useHtmlBlobUrl(editionHtml, { theme: 'light' })

  const reportVersionId = reportVersionIdFromReport(report)

  const calendarEditions = useMemo(() => {
    return editions
      .filter((e) => e.common_date)
      .map((e) => ({ id: e.id, dateKey: e.common_date!.slice(0, 10) }))
  }, [editions])

  const editionsByDateKey = useMemo(() => {
    const map = new Map<string, EditionRow>()
    for (const e of editions) {
      if (e.common_date) {
        const dk = e.common_date.slice(0, 10)
        if (!map.has(dk)) map.set(dk, e)
      }
    }
    return map
  }, [editions])

  const selectedDateKey = useMemo(() => {
    const sel = editions.find((e) => e.id === selectedEditionId)
    return sel?.common_date?.slice(0, 10) ?? null
  }, [editions, selectedEditionId])

  const handleCalendarSelect = (dateKey: string) => {
    const ed = editionsByDateKey.get(dateKey)
    if (ed) {
      setSelectedEditionId(ed.id)
      setCalendarOpen(false)
    }
  }

  const loadReport = useCallback(async () => {
    if (!reportId) return
    try {
      const r = await apiFetchJson<ReportDetail>(`/reports/${encodeURIComponent(reportId)}`)
      setReport(r)
    } catch {
      setReport(null)
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
    void loadEditions()
  }, [loadEditions])

  useEffect(() => {
    if (!selectedEditionId) {
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
  }, [selectedEditionId])

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
    void loadEditions()
  }

  const deleteReport = async () => {
    if (!reportId) return
    setDeleteBusy(true)
    setActionMsg(null)
    try {
      await apiFetchJson(`/reports/${encodeURIComponent(reportId)}`, { method: 'DELETE' })
      setDeleteOpen(false)
      void navigate('/reports')
    } catch (e) {
      setActionMsg({ text: e instanceof Error ? e.message : 'Delete failed', error: true })
    } finally {
      setDeleteBusy(false)
    }
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
      await loadEditions()
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
      await loadEditions()
    } catch (e) {
      setActionMsg({ text: e instanceof Error ? e.message : 'Save failed', error: true })
    } finally {
      setSavingDetails(false)
    }
  }

  const classic = getClassicUiReportUrl(reportId)
  const reportName =
    ((report ? String(report.report_name ?? report.title ?? '') : '') ||
      (loadingMeta ? 'Loading…' : 'Report')) as string
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
    const name = payload.metricName || 'this metric'
    const values = payload.rowValues
      ?.filter((v) => v.date && v.value)
      .map((v) => `${v.date}: ${v.value}`)
      .join(', ')
    let prompt = `Analyse the metric "${name}"`
    if (reportName) prompt += ` from the report "${reportName}"`
    if (values) prompt += `.\n\nHere are the recent values from the report: ${values}`
    prompt +=
      '.\n\nGive a concise summary: what it means, the latest vs prior period, and one or two notable callouts. Keep it brief; I can ask follow-ups if I want more depth.'
    openChatWithPrompt(prompt)
  }, [reportName])

  const activeIframeUrl = editionIframeUrl
  const previewLoading = !selectedEditionId ? loadingEditions : editionLoading

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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 rounded-xl"
                disabled={!report || deleteBusy}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2Icon className="mr-1.5 size-3.5" />
                Delete
              </Button>
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

      {reportId && editionHtml && (
        <ReportAnalysisPanel
          reportId={reportId}
          reportName={reportName}
          renderedHtml={editionHtml}
          editionId={selectedEditionId ?? undefined}
          reportVersionId={reportVersionId ?? undefined}
        />
      )}

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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={!deleteBusy}>
          <DialogHeader>
            <DialogTitle>Delete this report?</DialogTitle>
            <DialogDescription>
              <span className="text-foreground font-medium">{reportName}</span> and all versions, editions, saved
              templates, and dimension combinations will be permanently removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-lg" disabled={deleteBusy} onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-lg"
              disabled={deleteBusy}
              onClick={() => void deleteReport()}
            >
              {deleteBusy ? 'Deleting…' : 'Delete report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          {editionsError ? (
            <div
              className="border-destructive/30 bg-destructive/5 text-destructive rounded-2xl border px-4 py-3 text-sm"
              role="alert"
            >
              {editionsError}
            </div>
          ) : null}

          <div className="space-y-3">
            {editions.length > 0 && (
              <div className="flex items-center gap-3">
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-9 gap-2 rounded-xl px-3.5 text-sm">
                      <CalendarIcon className="size-3.5 text-muted-foreground" />
                      {selectedDateKey ? formatDateOnly(selectedDateKey) : 'Select edition'}
                      <ChevronDownIcon className={cn(
                        'size-3.5 text-muted-foreground transition-transform',
                        calendarOpen && 'rotate-180',
                      )} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-3">
                    <EditionCalendar
                      editions={calendarEditions}
                      selectedDate={selectedDateKey}
                      onSelect={handleCalendarSelect}
                    />
                  </PopoverContent>
                </Popover>

                {editions.length > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-7"
                      title="Previous edition"
                      disabled={!selectedEditionId || editions.findIndex((e) => e.id === selectedEditionId) >= editions.length - 1}
                      onClick={() => {
                        const idx = editions.findIndex((e) => e.id === selectedEditionId)
                        if (idx >= 0 && idx < editions.length - 1) setSelectedEditionId(editions[idx + 1].id)
                      }}
                    >
                      <ChevronLeftIcon className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-7"
                      title="Next edition"
                      disabled={!selectedEditionId || editions.findIndex((e) => e.id === selectedEditionId) <= 0}
                      onClick={() => {
                        const idx = editions.findIndex((e) => e.id === selectedEditionId)
                        if (idx > 0) setSelectedEditionId(editions[idx - 1].id)
                      }}
                    >
                      <ChevronRightIcon className="size-4" />
                    </Button>
                  </div>
                )}

                <span className="text-xs text-muted-foreground">
                  {editions.length} edition{editions.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            <DataTableCard className="p-0">
              {activeIframeUrl && !previewLoading && (
                <div className="flex items-center gap-1.5 border-b px-4 py-2 text-xs text-muted-foreground">
                  <SparklesIcon className="size-3 text-indigo-400" />
                  Click any metric name to chat with AI about it
                </div>
              )}
              {previewLoading ? (
                <Skeleton className="h-[min(52vh,560px)] w-full rounded-none rounded-b-2xl" />
              ) : activeIframeUrl ? (
                <ReportPreviewFrame
                  key={activeIframeUrl}
                  src={activeIframeUrl}
                  title="Edition preview"
                  independentLightChrome
                  onMetricClick={handleMetricClick}
                />
              ) : selectedEditionId ? (
                <div className="text-muted-foreground flex h-[min(40vh,320px)] items-center justify-center px-6 text-sm">
                  This edition has no inline HTML (content may only exist in S3). Open the classic UI to view it.
                </div>
              ) : loadingEditions ? (
                <Skeleton className="h-[min(52vh,560px)] w-full rounded-none rounded-b-2xl" />
              ) : (
                <div className="text-muted-foreground flex h-[min(40vh,320px)] items-center justify-center text-sm">
                  No editions available for this report.
                </div>
              )}
            </DataTableCard>
          </div>
        </>
      ) : null}
    </div>
  )
}
