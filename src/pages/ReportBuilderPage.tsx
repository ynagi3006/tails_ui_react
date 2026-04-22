import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ChevronRightIcon, EyeIcon, FileEditIcon, RefreshCwIcon, Undo2Icon } from 'lucide-react'
import Editor from '@monaco-editor/react'

import { ReportPreviewFrame } from '@/components/report-preview-frame'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetchJson } from '@/lib/api'
import { DEFAULT_REPORT_BUILDER_TEMPLATE } from '@/lib/default-report-template'
import { useHtmlBlobUrl } from '@/lib/html-blob-url'
import { configureMonacoLoader } from '@/lib/monaco-loader'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'
import { JinjaBuilderAgentPanel } from '@/components/jinja-builder-agent-panel'

configureMonacoLoader()

const TEMPLATE_STORAGE_KEY = 'tailsReportBuilderTemplateV1'
const AGENT_RAIL_STORAGE_KEY = 'tailsReportBuilderAgentRailOpenV1'
const TEMPLATE_UNDO_MAX = 40
const TEMPLATE_UNDO_DEBOUNCE_MS = 800

function loadAgentRailOpen(): boolean {
  try {
    if (sessionStorage.getItem(AGENT_RAIL_STORAGE_KEY) === '0') return false
  } catch {
    /* ignore */
  }
  return true
}

type RenderPreviewResponse = {
  html: string
  report_name?: string
  metrics_used?: string[]
}

function loadStoredTemplate(): string {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY)
    if (raw != null && raw.length > 0) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_REPORT_BUILDER_TEMPLATE
}

export function ReportBuilderPage() {
  const { resolved: themeResolved } = useTheme()
  const [template, setTemplateState] = useState(loadStoredTemplate)
  const templateHistoryRef = useRef<string[]>([])
  const [, bumpHistory] = useReducer((n: number) => n + 1, 0)
  const debounceTimerRef = useRef<number | null>(null)
  const burstSnapshotRef = useRef<string | null>(null)
  const isUndoingRef = useRef(false)

  const pushTemplateSnapshot = useCallback((snapshot: string) => {
    templateHistoryRef.current = [...templateHistoryRef.current.slice(-(TEMPLATE_UNDO_MAX - 1)), snapshot]
    bumpHistory()
  }, [])

  const handleEditorChange = useCallback(
    (v: string | undefined) => {
      if (isUndoingRef.current) {
        setTemplateState(v ?? '')
        return
      }
      const next = v ?? ''
      setTemplateState((prev) => {
        if (next === prev) return prev
        if (burstSnapshotRef.current === null) {
          burstSnapshotRef.current = prev
        }
        if (debounceTimerRef.current != null) {
          window.clearTimeout(debounceTimerRef.current)
        }
        debounceTimerRef.current = window.setTimeout(() => {
          debounceTimerRef.current = null
          const snap = burstSnapshotRef.current
          burstSnapshotRef.current = null
          if (snap != null) {
            pushTemplateSnapshot(snap)
          }
        }, TEMPLATE_UNDO_DEBOUNCE_MS)
        return next
      })
    },
    [pushTemplateSnapshot],
  )

  const applyTemplateFromAgent = useCallback(
    (html: string) => {
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      burstSnapshotRef.current = null
      setTemplateState((prev) => {
        if (html !== prev) {
          pushTemplateSnapshot(prev)
        }
        return html
      })
    },
    [pushTemplateSnapshot],
  )

  const undoTemplate = useCallback(() => {
    const stack = templateHistoryRef.current
    if (stack.length === 0) return
    const snapshot = stack[stack.length - 1]!
    templateHistoryRef.current = stack.slice(0, -1)
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    burstSnapshotRef.current = null
    isUndoingRef.current = true
    setTemplateState(snapshot)
    queueMicrotask(() => {
      isUndoingRef.current = false
    })
    bumpHistory()
  }, [])

  const canUndoTemplate = templateHistoryRef.current.length > 0
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null)
  const [focusMode, setFocusMode] = useState<'split' | 'editor' | 'preview'>('split')
  const [agentOpen, setAgentOpen] = useState(loadAgentRailOpen)
  const persistTimer = useRef<number>(0)

  /* Preview HTML is authored for print/light reports; keep iframe document and chrome off app theme */
  const previewUrl = useHtmlBlobUrl(previewHtml, { theme: 'light' })

  useEffect(() => {
    window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(TEMPLATE_STORAGE_KEY, template)
      } catch {
        /* quota */
      }
    }, 400)
    return () => window.clearTimeout(persistTimer.current)
  }, [template])

  useEffect(() => {
    try {
      sessionStorage.setItem(AGENT_RAIL_STORAGE_KEY, agentOpen ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [agentOpen])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const renderPreview = useCallback(async () => {
    const trimmed = template.trim()
    if (!trimmed) {
      setStatus({ text: 'Template is required before rendering.', error: true })
      return
    }
    setPreviewLoading(true)
    setStatus({ text: 'Rendering preview…' })
    try {
      const data = await apiFetchJson<RenderPreviewResponse>('/reports/render-preview', {
        method: 'POST',
        body: JSON.stringify({
          template: trimmed,
          report_name: 'Report Builder Preview',
        }),
      })
      setPreviewHtml(data.html || '')
      setStatus({ text: 'Rendered successfully.' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Render failed'
      setPreviewHtml(null)
      setStatus({ text: msg, error: true })
    } finally {
      setPreviewLoading(false)
    }
  }, [template])

  const monacoTheme = themeResolved === 'dark' ? 'vs-dark' : 'light'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <PageHeader
        className="shrink-0"
        title="Report Builder"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="border-border/60 bg-muted/30 flex rounded-full border p-0.5">
              <Button
                type="button"
                size="sm"
                variant={focusMode === 'split' ? 'secondary' : 'ghost'}
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => setFocusMode('split')}
              >
                All
              </Button>
              <Button
                type="button"
                size="sm"
                variant={focusMode === 'editor' ? 'secondary' : 'ghost'}
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => setFocusMode('editor')}
              >
                <FileEditIcon className="mr-1 size-3.5" />
                Template
              </Button>
              <Button
                type="button"
                size="sm"
                variant={focusMode === 'preview' ? 'secondary' : 'ghost'}
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => setFocusMode('preview')}
              >
                <EyeIcon className="mr-1 size-3.5" />
                Preview
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              className="rounded-xl"
              disabled={previewLoading}
              onClick={() => void renderPreview()}
            >
              <RefreshCwIcon className={cn('size-3.5', previewLoading && 'animate-spin')} />
              Render
            </Button>
          </div>
        }
      />

      {status ? (
        <p
          className={cn(
            'shrink-0 text-sm',
            status.error ? 'text-destructive' : 'text-muted-foreground',
          )}
          role="status"
        >
          {status.text}
        </p>
      ) : null}

      <div
        className={cn(
          'grid min-h-0 flex-1 gap-4',
          'lg:overflow-hidden',
          'lg:grid-rows-[minmax(0,1fr)]',
          'grid-cols-1',
          /* split: AI | template | preview */
          focusMode === 'split' &&
            (agentOpen
              ? 'lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_minmax(0,1fr)]'
              : 'lg:grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1fr)]'),
          /* template focus: AI + editor */
          focusMode === 'editor' &&
            (agentOpen
              ? 'lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]'
              : 'lg:grid-cols-[2.75rem_minmax(0,1fr)]'),
          /* preview focus: AI + preview */
          focusMode === 'preview' &&
            (agentOpen
              ? 'lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]'
              : 'lg:grid-cols-[2.75rem_minmax(0,1fr)]'),
        )}
      >
        <div
          className={cn(
            'flex min-h-0 flex-col gap-2 overflow-hidden',
            'min-h-[min(44vh,380px)] max-h-[min(56vh,560px)] lg:max-h-none lg:h-full',
          )}
        >
          {agentOpen ? (
            <JinjaBuilderAgentPanel
              className="min-h-0 h-full w-full min-w-0 flex-1"
              templateDraft={template}
              onApplyToEditor={applyTemplateFromAgent}
              onCollapse={() => setAgentOpen(false)}
            />
          ) : (
            <>
              <div className="hidden min-h-0 flex-1 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
                <Button
                  type="button"
                  variant="outline"
                  className="border-border/70 bg-muted/20 text-muted-foreground hover:text-foreground flex h-full min-h-48 w-full flex-1 flex-col gap-2 rounded-2xl px-0 py-4 shadow-sm"
                  aria-label="Expand AI builder"
                  onClick={() => setAgentOpen(true)}
                >
                  <ChevronRightIcon className="size-4 shrink-0" />
                  <span className="text-[0.65rem] leading-tight [writing-mode:vertical-rl] [text-orientation:mixed]">
                    AI builder
                  </span>
                </Button>
              </div>
              <Button type="button" variant="outline" className="w-full lg:hidden" onClick={() => setAgentOpen(true)}>
                Show AI builder
              </Button>
            </>
          )}
        </div>

        <Card
          className={cn(
            'border-border/70 flex min-h-[280px] flex-col overflow-hidden rounded-2xl shadow-sm lg:h-full lg:max-h-full lg:min-h-0',
            focusMode === 'preview' && 'hidden',
          )}
        >
          <div className="border-border/60 bg-muted/25 flex flex-wrap items-start justify-between gap-2 border-b px-4 py-2.5">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Jinja template</h2>
              <p className="text-muted-foreground text-xs">Monaco · HTML mode (same stack as classic Report Builder)</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 text-xs"
              disabled={!canUndoTemplate}
              onClick={undoTemplate}
            >
              <Undo2Icon className="size-3.5" />
              Undo
            </Button>
          </div>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="h-full w-full min-h-72 flex-1 lg:min-h-0">
              <Editor
                height="100%"
                width="100%"
                className="overflow-hidden"
                defaultLanguage="html"
                theme={monacoTheme}
                value={template}
                onChange={handleEditorChange}
                options={{
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  fontSize: 14,
                  lineHeight: 22,
                  tabSize: 2,
                  insertSpaces: true,
                  automaticLayout: true,
                  padding: { top: 12, bottom: 12 },
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card
          className={cn(
            'border-border/70 flex min-h-[280px] flex-col overflow-hidden rounded-2xl shadow-sm lg:h-full lg:max-h-full lg:min-h-0',
            focusMode === 'editor' && 'hidden',
          )}
        >
          <div className="border-border/60 bg-muted/25 border-b px-4 py-2.5">
            <h2 className="text-sm font-semibold tracking-tight">Rendered preview</h2>
            <p className="text-muted-foreground text-xs">Server-side render, same as classic builder</p>
          </div>
          <CardContent className="bg-muted/10 flex min-h-0 flex-1 flex-col p-0">
            <div className="flex min-h-64 flex-1 flex-col overflow-hidden lg:min-h-0">
              {previewLoading ? (
                <Skeleton className="h-full min-h-[240px] w-full rounded-none" />
              ) : previewUrl ? (
                <ReportPreviewFrame
                  key={previewUrl}
                  src={previewUrl}
                  title="Report builder preview"
                  independentLightChrome
                />
              ) : (
                <div className="text-muted-foreground flex flex-1 items-center justify-center px-6 py-16 text-center text-sm">
                  Run <span className="text-foreground mx-1 font-medium">Render</span> to preview output here.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
