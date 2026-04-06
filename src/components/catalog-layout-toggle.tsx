import { LayoutGridIcon, LayoutListIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { CatalogLayoutMode } from '@/hooks/use-catalog-layout'

type CatalogLayoutToggleProps = {
  value: CatalogLayoutMode
  onChange: (v: CatalogLayoutMode) => void
  className?: string
}

export function CatalogLayoutToggle({ value, onChange, className }: CatalogLayoutToggleProps) {
  return (
    <div
      className={cn('border-border/60 bg-muted/30 flex rounded-full border p-0.5', className)}
      role="group"
      aria-label="Result layout"
    >
      <Button
        type="button"
        size="sm"
        variant={value === 'list' ? 'secondary' : 'ghost'}
        className="h-8 gap-1.5 rounded-full px-3"
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
      >
        <LayoutListIcon className="size-3.5 opacity-80" aria-hidden />
        List
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === 'cards' ? 'secondary' : 'ghost'}
        className="h-8 gap-1.5 rounded-full px-3"
        aria-pressed={value === 'cards'}
        onClick={() => onChange('cards')}
      >
        <LayoutGridIcon className="size-3.5 opacity-80" aria-hidden />
        Cards
      </Button>
    </div>
  )
}
