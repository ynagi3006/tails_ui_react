import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

type Props = {
  src: string
  title: string
}

/**
 * iframe is keyed by src in the parent so state resets per blob URL without effect setState.
 * Scrolling is on the outer div so wide reports get a horizontal scrollbar at the bottom of the
 * visible preview area.
 */
export function ReportPreviewFrame({ src, title }: Props) {
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
