import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/hooks/use-theme'
import type { ThemePreference } from '@/lib/theme-storage'
import { cn } from '@/lib/utils'

export function ThemeMenu({ className }: { className?: string }) {
  const { preference, setPreference, resolved } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn('inline-flex', className)} asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground size-8 shrink-0 rounded-full"
          type="button"
          aria-label="Color theme"
        >
          {resolved === 'dark' ? (
            <MoonIcon className="size-4" aria-hidden />
          ) : (
            <SunIcon className="size-4" aria-hidden />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-xl">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(v) => setPreference(v as ThemePreference)}
        >
          <DropdownMenuRadioItem value="light" className="gap-2">
            <SunIcon className="size-4 opacity-70" aria-hidden />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="gap-2">
            <MoonIcon className="size-4 opacity-70" aria-hidden />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="gap-2">
            <MonitorIcon className="size-4 opacity-70" aria-hidden />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
