import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/** Muted surface for filters / search rows — reads as one control strip. */
export function ToolbarCard({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'bg-muted/30 border-border/80 flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between',
        className,
      )}
      {...props}
    />
  )
}
