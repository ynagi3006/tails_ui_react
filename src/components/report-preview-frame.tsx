import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

export type MetricClickRect = {
  top: number
  left: number
  width: number
  height: number
}

export type MetricClickPayload = {
  metricName: string
  value: string
  columnHeader: string
  rowContext: string
  sectionHeader?: string
  recordDttm?: string
  /** Position of the clicked cell in parent viewport coordinates. */
  viewportRect?: MetricClickRect
  /** All date column headers from the table (e.g. ["2026-03-01","2026-03-08",...]) */
  columnDates?: string[]
  /** The metric's values from the clicked row, paired with column dates. */
  rowValues?: Array<{ date: string; value: string }>
}

type Props = {
  src: string
  title: string
  onMetricClick?: (payload: MetricClickPayload) => void
}

/**
 * iframe is keyed by src in the parent so state resets per blob URL without effect setState.
 * Scrolling is on the outer div so wide reports get a horizontal scrollbar at the bottom of the
 * visible preview area.
 */
export function ReportPreviewFrame({ src, title, onMetricClick }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const scrollBoxRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)

  const measure = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    const root = doc?.documentElement
    const body = doc?.body
    if (!root || !body) return

    const cw = scrollBoxRef.current?.clientWidth ?? 0
    const contentW = Math.max(
      root.scrollWidth,
      body.scrollWidth,
      root.offsetWidth,
      body.offsetWidth,
    )
    const contentH = Math.max(
      root.scrollHeight,
      body.scrollHeight,
      root.offsetHeight,
      body.offsetHeight,
    )

    setDims({
      w: Math.max(contentW, cw, 360),
      h: Math.max(contentH, 160),
    })
  }, [])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const scheduleMeasure = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(measure)
      })
    }

    const onLoad = () => {
      scheduleMeasure()
    }

    iframe.addEventListener('load', onLoad)

    let innerRo: ResizeObserver | undefined
    const watchInner = () => {
      const doc = iframe.contentDocument
      if (!doc?.body) return
      innerRo?.disconnect()
      innerRo = new ResizeObserver(() => measure())
      innerRo.observe(doc.body)
      innerRo.observe(doc.documentElement)
    }

    if (iframe.contentDocument?.readyState === 'complete') {
      scheduleMeasure()
      watchInner()
    }

    let pollCount = 0
    const pollId = window.setInterval(() => {
      measure()
      watchInner()
      pollCount += 1
      if (pollCount >= 24) window.clearInterval(pollId)
    }, 200)

    const outer = scrollBoxRef.current
    let outerRo: ResizeObserver | undefined
    if (outer) {
      outerRo = new ResizeObserver(() => measure())
      outerRo.observe(outer)
    }

    window.addEventListener('resize', measure)

    return () => {
      iframe.removeEventListener('load', onLoad)
      innerRo?.disconnect()
      outerRo?.disconnect()
      window.clearInterval(pollId)
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  useEffect(() => {
    if (!onMetricClick) return
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'tails:metric-click') return
      const payload: MetricClickPayload = {
        metricName: e.data.metricName ?? '',
        value: e.data.value ?? '',
        columnHeader: e.data.columnHeader ?? '',
        rowContext: e.data.rowContext ?? '',
        sectionHeader: e.data.sectionHeader,
        recordDttm: e.data.recordDttm,
        columnDates: Array.isArray(e.data.columnDates) ? e.data.columnDates : undefined,
        rowValues: Array.isArray(e.data.rowValues) ? e.data.rowValues : undefined,
      }
      const cr = e.data.clickRect
      const iframe = iframeRef.current
      if (cr && iframe) {
        const ir = iframe.getBoundingClientRect()
        payload.viewportRect = {
          top: ir.top + cr.top,
          left: ir.left + cr.left,
          width: cr.width,
          height: cr.height,
        }
      }
      onMetricClick(payload)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onMetricClick])

  const iframeStyle: CSSProperties = dims
    ? {
        width: `${dims.w}px`,
        minWidth: '100%',
        height: `${dims.h}px`,
        display: 'block',
        border: 0,
      }
    : {
        width: '100%',
        minHeight: 480,
        display: 'block',
        border: 0,
      }

  return (
    <div
      ref={scrollBoxRef}
      className="bg-background max-h-[min(88vh,1040px)] overflow-auto overscroll-x-contain rounded-b-2xl"
    >
      <iframe
        ref={iframeRef}
        title={title}
        src={src}
        className="bg-background max-w-none border-0"
        style={iframeStyle}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  )
}
