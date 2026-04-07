import { useMemo, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type EditionEntry = {
  id: string
  dateKey: string // YYYY-MM-DD
  label?: string
}

type Props = {
  editions: EditionEntry[]
  selectedDate: string | null
  onSelect: (dateKey: string) => void
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function toDateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseDateKey(s: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(s)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]) - 1 }
}

export function EditionCalendar({ editions, selectedDate, onSelect }: Props) {
  const editionsByDate = useMemo(() => {
    const map = new Map<string, EditionEntry>()
    for (const e of editions) {
      if (!map.has(e.dateKey)) map.set(e.dateKey, e)
    }
    return map
  }, [editions])

  const initialMonth = useMemo(() => {
    const target = selectedDate ?? editions[0]?.dateKey
    if (target) {
      const parsed = parseDateKey(target)
      if (parsed) return parsed
    }
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  }, [selectedDate, editions])

  const [viewYear, setViewYear] = useState(initialMonth.year)
  const [viewMonth, setViewMonth] = useState(initialMonth.month)

  const days = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay()
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

    const cells: Array<{ day: number; key: string } | null> = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, key: toDateKey(viewYear, viewMonth, d) })
    }
    return cells
  }, [viewYear, viewMonth])

  const goPrev = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11) }
    else setViewMonth(viewMonth - 1)
  }
  const goNext = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0) }
    else setViewMonth(viewMonth + 1)
  }

  const today = toDateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())

  return (
    <div className="w-[280px] select-none">
      <div className="flex items-center justify-between px-1 pb-3">
        <Button variant="ghost" size="icon-sm" className="size-7" onClick={goPrev}>
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="text-sm font-semibold">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <Button variant="ghost" size="icon-sm" className="size-7" onClick={goNext}>
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="pb-1.5 text-center text-[11px] font-medium text-muted-foreground">
            {wd}
          </div>
        ))}

        {days.map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} />
          const hasEdition = editionsByDate.has(cell.key)
          const isSelected = cell.key === selectedDate
          const isToday = cell.key === today

          return (
            <button
              key={cell.key}
              type="button"
              disabled={!hasEdition}
              onClick={() => hasEdition && onSelect(cell.key)}
              className={cn(
                'relative mx-auto flex size-8 items-center justify-center rounded-md text-xs transition-colors',
                hasEdition && !isSelected && 'font-medium text-foreground hover:bg-muted cursor-pointer',
                !hasEdition && 'text-muted-foreground/40 cursor-default',
                isSelected && 'bg-primary text-primary-foreground font-semibold',
                isToday && !isSelected && 'ring-1 ring-primary/40',
              )}
            >
              {cell.day}
              {hasEdition && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary/60" />
              )}
            </button>
          )
        })}
      </div>

      {editions.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
          <span className="inline-block size-1.5 rounded-full bg-primary/60" />
          {editions.length} edition{editions.length !== 1 ? 's' : ''} available
        </div>
      )}
    </div>
  )
}
