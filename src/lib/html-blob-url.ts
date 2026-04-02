import { useEffect, useMemo } from 'react'

import { buildReportPreviewDocument, type ReportPreviewTheme } from '@/lib/report-preview-document'

export function useHtmlBlobUrl(
  html: string | null | undefined,
  options?: { theme?: ReportPreviewTheme },
): string | null {
  const theme = options?.theme ?? 'light'

  const url = useMemo(() => {
    if (!html) return null
    const doc = buildReportPreviewDocument(html, theme)
    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' })
    return URL.createObjectURL(blob)
  }, [html, theme])

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])

  return url
}
