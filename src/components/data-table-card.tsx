import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

export function DataTableCard({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'border-border/80 bg-card overflow-hidden rounded-2xl border shadow-sm',
        className,
      )}
      {...props}
    />
  )
}
