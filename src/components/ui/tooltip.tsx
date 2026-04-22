"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delayDuration = 280,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "text-popover-foreground z-60 max-w-xs origin-(--radix-tooltip-content-transform-origin) rounded-xl border border-border/90 bg-popover px-3 py-2 text-xs shadow-lg ring-1 ring-foreground/10 duration-100",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
          "data-[state=instant-open]:animate-in data-[state=instant-open]:fade-in-0 data-[state=instant-open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

/** Small hover “thumbnail” card for icon-only (or compact) controls. */
function IconHoverTip({
  title,
  caption,
  side = "top",
  delayDuration = 220,
  children,
}: {
  title: string
  caption?: string
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"]
  delayDuration?: number
  children: React.ReactNode
}) {
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-60 px-3 py-2.5">
        <div className="bg-primary/15 mb-2 h-1 w-10 rounded-full" aria-hidden />
        <p className="text-foreground text-xs font-semibold leading-tight">{title}</p>
        {caption ? (
          <p className="text-muted-foreground mt-1.5 text-[0.7rem] leading-relaxed">{caption}</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, IconHoverTip }
