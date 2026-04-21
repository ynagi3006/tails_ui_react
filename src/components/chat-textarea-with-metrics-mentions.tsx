import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { apiFetchJson } from '@/lib/api'
import { detectMetricsMentionTrigger } from '@/lib/metrics-mention-trigger'
import { metricNameFromRow, parseMetricsList } from '@/lib/parse-metric-response'
import { cn } from '@/lib/utils'

type MetricMentionRow = {
  key: string
  name: string
  description: string
  meta: string
}

function mapRow(r: Record<string, unknown>): MetricMentionRow {
  const name = metricNameFromRow(r) || 'Untitled metric'
  const id = String(r.id ?? r.metric_id ?? '')
  const desc = String(r.description ?? '')
  const tags = Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : []
  const cw = r.collection_window != null ? String(r.collection_window) : ''
  const metaParts = [cw, tags.slice(0, 3).join(', ')].filter(Boolean)
  return {
    key: id || name,
    name,
    description: desc,
    meta: metaParts.join(' · '),
  }
}

type Props = Omit<React.ComponentProps<typeof Textarea>, 'ref' | 'value' | 'onChange'> & {
  value: string
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
}

function mergeRefs<T extends HTMLTextAreaElement>(
  ...refs: Array<React.Ref<T | null> | undefined>
): React.RefCallback<T> {
  return (node) => {
    refs.forEach((r) => {
      if (!r) return
      if (typeof r === 'function') (r as React.RefCallback<T | null>)(node)
      else (r as React.MutableRefObject<T | null>).current = node
    })
  }
}

export const ChatTextareaWithMetricsMentions = forwardRef<HTMLTextAreaElement, Props>(
  function ChatTextareaWithMetricsMentions(
    { className, value, onChange, onKeyDown, disabled, ...rest },
    forwardedRef,
  ) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null)
    const wrapRef = useRef<HTMLDivElement>(null)
    const popoverRef = useRef<HTMLDivElement>(null)
    const listId = useId()
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [open, setOpen] = useState(false)
    const [hintOnly, setHintOnly] = useState(false)
    const [rows, setRows] = useState<MetricMentionRow[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [checkedNames, setCheckedNames] = useState<Set<string>>(() => new Set())
    const [anchorStart, setAnchorStart] = useState(-1)
    const [popoverFixed, setPopoverFixed] = useState<{
      left: number
      width: number
      bottom: number
      maxHeight: number
    } | null>(null)

    const updatePopoverPosition = useCallback(() => {
      const wrap = wrapRef.current
      if (!wrap) return
      const rect = wrap.getBoundingClientRect()
      const gap = 6
      const bottom = window.innerHeight - rect.top + gap
      const spaceAbove = rect.top - gap - 10
      const maxHeight = Math.min(window.innerHeight * 0.48, Math.max(80, spaceAbove))
      setPopoverFixed({
        left: rect.left,
        width: Math.max(rect.width, 200),
        bottom,
        maxHeight,
      })
    }, [])

    const closeMention = useCallback(() => {
      setOpen(false)
      setHintOnly(false)
      setRows([])
      setSelectedIndex(0)
      setCheckedNames(new Set())
      setAnchorStart(-1)
      setPopoverFixed(null)
      setLoading(false)
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }, [])

    const syncFromCursor = useCallback(
      (text: string, cursor: number) => {
        const t = detectMetricsMentionTrigger(text, cursor)
        if (t.kind === 'none') {
          closeMention()
          return
        }
        setAnchorStart(t.anchorStart)
        setOpen(true)
        if (t.kind === 'hint') {
          setHintOnly(true)
          setRows([])
          setLoading(false)
          return
        }
        setHintOnly(false)
        const q = t.query
        if (!q) {
          setRows([])
          setLoading(false)
          return
        }
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
          setLoading(true)
          try {
            const params = new URLSearchParams({ search: q, limit: '10' })
            const data = await apiFetchJson<unknown>(`/metrics?${params.toString()}`)
            const list = parseMetricsList(data).map(mapRow)
            const ta = innerRef.current
            if (!ta) return
            const still = detectMetricsMentionTrigger(ta.value, ta.selectionStart ?? ta.value.length)
            if (still.kind !== 'search' || still.query !== q) return
            setRows(list)
            setSelectedIndex(0)
          } catch {
            setRows([])
          } finally {
            setLoading(false)
          }
        }, 250)
      },
      [closeMention],
    )

    useEffect(() => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }, [])

    useLayoutEffect(() => {
      if (!open) {
        setPopoverFixed(null)
        return
      }
      updatePopoverPosition()
    }, [open, updatePopoverPosition, rows.length, hintOnly, loading, selectedIndex, checkedNames.size])

    useEffect(() => {
      if (!open) return
      const onMove = () => updatePopoverPosition()
      window.addEventListener('resize', onMove)
      window.addEventListener('scroll', onMove, true)
      return () => {
        window.removeEventListener('resize', onMove)
        window.removeEventListener('scroll', onMove, true)
      }
    }, [open, updatePopoverPosition])

    useEffect(() => {
      const onDoc = (e: MouseEvent) => {
        if (!open) return
        const wrap = wrapRef.current
        const pop = popoverRef.current
        const t = e.target
        if (t instanceof Node) {
          if (wrap?.contains(t)) return
          if (pop?.contains(t)) return
        }
        closeMention()
      }
      document.addEventListener('mousedown', onDoc)
      return () => document.removeEventListener('mousedown', onDoc)
    }, [open, closeMention])

    const applyInsert = useCallback(() => {
      const ta = innerRef.current
      if (!ta || !onChange || anchorStart < 0 || checkedNames.size === 0) return
      const text = value
      const before = text.slice(0, anchorStart)
      const after = text.slice(ta.selectionStart)
      const inserted = Array.from(checkedNames).join(', ') + ' '
      const next = before + inserted + after
      const pos = before.length + inserted.length
      onChange({
        target: { ...ta, value: next, selectionStart: pos, selectionEnd: pos },
        currentTarget: ta,
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>)
      closeMention()
      requestAnimationFrame(() => {
        ta.focus()
        try {
          ta.setSelectionRange(pos, pos)
        } catch {
          /* ignore */
        }
      })
    }, [anchorStart, checkedNames, closeMention, onChange, value])

    const toggleRow = useCallback((name: string) => {
      setCheckedNames((prev) => {
        const next = new Set(prev)
        if (next.has(name)) next.delete(name)
        else next.add(name)
        return next
      })
    }, [])

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(e)
      const ta = e.target
      syncFromCursor(ta.value, ta.selectionStart)
    }

    const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget
      syncFromCursor(ta.value, ta.selectionStart)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (open && (rows.length > 0 || hintOnly)) {
        if (e.key === 'Escape') {
          e.preventDefault()
          closeMention()
          onKeyDown?.(e)
          return
        }
        if (rows.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex((i) => (i + 1) % rows.length)
            return
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex((i) => (i - 1 + rows.length) % rows.length)
            return
          }
          if (e.key === ' ') {
            e.preventDefault()
            const name = rows[selectedIndex]?.name
            if (name) toggleRow(name)
            return
          }
          if (e.key === 'Enter') {
            if (checkedNames.size > 0) {
              e.preventDefault()
              applyInsert()
              return
            }
            if (rows[selectedIndex]) {
              e.preventDefault()
              toggleRow(rows[selectedIndex].name)
              return
            }
          }
        }
      }

      onKeyDown?.(e)
    }

    const mentionPopover =
      open && popoverFixed ? (
        <div
          ref={popoverRef}
          id={listId}
          role="listbox"
          aria-label="Metric suggestions"
          className="border-border/70 bg-popover text-popover-foreground flex flex-col overflow-hidden rounded-xl border shadow-lg ring-1 ring-black/5"
          style={{
            position: 'fixed',
            left: popoverFixed.left,
            width: popoverFixed.width,
            bottom: popoverFixed.bottom,
            maxHeight: popoverFixed.maxHeight,
            zIndex: 400,
          }}
        >
          {hintOnly && rows.length === 0 && !loading ? (
            <div className="text-muted-foreground shrink-0 px-3 py-2.5 text-xs">Type a keyword to search metrics…</div>
          ) : null}
          {loading ? <div className="text-muted-foreground shrink-0 px-3 py-2 text-xs">Searching…</div> : null}
          {!hintOnly && !loading && rows.length === 0 ? (
            <div className="text-muted-foreground shrink-0 px-3 py-2.5 text-xs">No metrics found</div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            {rows.map((row, idx) => {
              const active = idx === selectedIndex
              const checked = checkedNames.has(row.name)
              return (
                <button
                  key={row.key}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cn(
                    'flex w-full items-start gap-2 border-b border-border/40 px-2.5 py-2 text-left text-xs last:border-b-0',
                    active && 'bg-muted/80',
                  )}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => toggleRow(row.name)}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border',
                      checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                    )}
                    aria-hidden
                  >
                    {checked ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block font-medium">{row.name}</span>
                    {row.description ? (
                      <span className="text-muted-foreground line-clamp-2 block text-[0.65rem] leading-snug">
                        {row.description}
                      </span>
                    ) : null}
                    {row.meta ? (
                      <span className="text-muted-foreground/80 mt-0.5 block text-[0.6rem]">{row.meta}</span>
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
          {checkedNames.size > 0 ? (
            <div className="border-border/60 bg-muted/30 flex shrink-0 items-center justify-between gap-2 border-t px-2 py-2">
              <span className="text-muted-foreground text-[0.65rem]">
                {checkedNames.size} metric{checkedNames.size > 1 ? 's' : ''} selected
              </span>
              <Button type="button" size="sm" className="h-8 shrink-0 px-3 text-xs" onClick={() => applyInsert()}>
                Insert
              </Button>
            </div>
          ) : null}
        </div>
      ) : null

    return (
      <div ref={wrapRef} className="relative min-w-0 flex-1">
        {mentionPopover ? createPortal(mentionPopover, document.body) : null}

        <Textarea
          ref={mergeRefs(innerRef, forwardedRef)}
          className={className}
          value={value}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          onClick={handleSelect}
          disabled={disabled}
          {...rest}
        />
      </div>
    )
  },
)
