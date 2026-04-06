import { useCallback, useEffect, useRef, useState } from 'react'
import { EyeIcon, FileEditIcon, RefreshCwIcon } from 'lucide-react'
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

configureMonacoLoader()

const TEMPLATE_STORAGE_KEY = 'tailsReportBuilderTemplateV1'

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
  const [template, setTemplate] = useState(loadStoredTemplate)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null)
  const [focusMode, setFocusMode] = useState<'split' | 'editor' | 'preview'>('split')
  const persistTimer = useRef<number>(0)

  const previewUrl = useHtmlBlobUrl(previewHtml, { theme: themeResolved })

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
    <div className="space-y-6">
      <PageHeader
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
                Split
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
            'text-sm',
            status.error ? 'text-destructive' : 'text-muted-foreground',
          )}
          role="status"
        >
          {status.text}
        </p>
      ) : null}

      <div
        className={cn(
          'grid min-h-[min(70vh,640px)] gap-4 lg:min-h-[min(75vh,720px)]',
          focusMode === 'split' && 'lg:grid-cols-2',
          focusMode === 'editor' && 'grid-cols-1',
          focusMode === 'preview' && 'grid-cols-1',
        )}
      >
        <Card
          className={cn(
            'border-border/70 flex min-h-[320px] flex-col overflow-hidden rounded-2xl shadow-sm',
            focusMode === 'preview' && 'hidden',
          )}
        >
          <div className="border-border/60 bg-muted/25 border-b px-4 py-2.5">
            <h2 className="text-sm font-semibold tracking-tight">Jinja template</h2>
            <p className="text-muted-foreground text-xs">Monaco · HTML mode (same stack as classic Report Builder)</p>
          </div>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="h-[min(58vh,600px)] w-full min-h-[22rem] shrink-0">
              <Editor
                height="100%"
                width="100%"
                className="overflow-hidden"
                defaultLanguage="html"
                theme={monacoTheme}
                value={template}
                onChange={(v) => setTemplate(v ?? '')}
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
            'border-border/70 flex min-h-[320px] flex-col overflow-hidden rounded-2xl shadow-sm',
            focusMode === 'editor' && 'hidden',
          )}
        >
          <div className="border-border/60 bg-muted/25 border-b px-4 py-2.5">
            <h2 className="text-sm font-semibold tracking-tight">Rendered preview</h2>
            <p className="text-muted-foreground text-xs">Server-side render, same as classic builder</p>
          </div>
          <CardContent className="bg-muted/10 flex min-h-0 flex-1 flex-col p-0">
            <div className="flex min-h-[min(50vh,520px)] flex-1 flex-col overflow-hidden">
              {previewLoading ? (
                <Skeleton className="h-full min-h-[240px] w-full rounded-none" />
              ) : previewUrl ? (
                <ReportPreviewFrame key={previewUrl} src={previewUrl} title="Report builder preview" />
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
