"use client"

import { PropsWithChildren } from "react"
import { useTranslations } from "next-intl"
import { Separator } from "@/components/ui/separator"

interface SelectionBarProps extends PropsWithChildren {
  selectedCount: number
  /** left offset in pixels to avoid covering the select-all column */
  offsetLeft?: number
}

export function SelectionBar({ selectedCount, offsetLeft = 0, children }: SelectionBarProps) {
  const t = useTranslations("backoffice.shared.table")

  if (selectedCount <= 0) return null

  // Overlay bar that covers the table header
  return (
    <div
      className="absolute top-0 z-10 bg-background border-b h-10"
      style={{ left: offsetLeft, right: 0 }}
    >
      <div className="flex h-full items-center justify-between px-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{t("selectedCount", { count: selectedCount })}</span>
          <Separator orientation="vertical" className="h-4" />
        </div>
        <div className="flex items-center gap-2">
          {children}
        </div>
      </div>
    </div>
  )
}


