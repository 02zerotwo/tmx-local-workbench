"use client"

import { GripVertical } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) {
  return (
    <ResizablePrimitive.Group
      className={cn(
        "flex size-full data-[panel-group-direction=vertical]:flex-col",
        className,
      )}
      data-panel-group-direction={orientation}
      data-slot="resizable-panel-group"
      orientation={orientation}
      {...props}
    />
  )
}

function ResizablePanel({
  defaultSize,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return (
    <ResizablePrimitive.Panel
      data-default-size={defaultSize}
      data-slot="resizable-panel"
      defaultSize={defaultSize}
      {...props}
    />
  )
}

function ResizableHandle({
  className,
  withHandle = false,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      className={cn(
        "group relative z-10 flex w-px shrink-0 items-center justify-center bg-border outline-none transition-colors hover:bg-blue-400 focus-visible:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 data-[separator=active]:bg-blue-500",
        className,
      )}
      data-slot="resizable-handle"
      {...props}
    >
      {withHandle ? (
        <span className="z-10 flex h-10 w-3 items-center justify-center rounded-sm border border-border bg-background text-muted-foreground shadow-xs transition-colors group-hover:border-blue-300 group-hover:text-blue-700">
          <GripVertical className="size-3" />
        </span>
      ) : null}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
