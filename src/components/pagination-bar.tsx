import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type PaginationBarProps = {
  page: number
  hasNextPage: boolean
  onPrev: () => void
  onNext: () => void
  onJump?: (page: number) => void
  disabled?: boolean
  className?: string
}

export function PaginationBar({
  page,
  hasNextPage,
  onPrev,
  onNext,
  onJump,
  disabled,
  className,
}: PaginationBarProps) {
  return (
    <nav
      className={cn(
        'border-border/60 bg-muted/25 flex flex-wrap items-center justify-center gap-2 rounded-full border px-2 py-1.5',
        className,
      )}
      aria-label="Pagination"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 rounded-full px-3"
        disabled={disabled || page <= 1}
        onClick={onPrev}
      >
        Previous
      </Button>
      <div className="text-muted-foreground flex items-center gap-2 px-1 text-sm">
        <span>Page</span>
        {onJump ? (
          <Input
            className="border-border/80 bg-background h-8 w-14 rounded-full text-center text-sm"
            type="number"
            min={1}
            defaultValue={page}
            key={page}
            onBlur={(e) => {
              const n = parseInt(e.target.value, 10)
              if (n >= 1 && n !== page) onJump(n)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              const n = parseInt((e.target as HTMLInputElement).value, 10)
              if (n >= 1) onJump(n)
            }}
          />
        ) : (
          <span className="text-foreground font-medium">{page}</span>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 rounded-full px-3"
        disabled={disabled || !hasNextPage}
        onClick={onNext}
      >
        Next
      </Button>
    </nav>
  )
}
