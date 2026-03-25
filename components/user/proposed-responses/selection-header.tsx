"use client"

import { PropsWithChildren } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Send } from "lucide-react"

interface SelectionHeaderProps extends PropsWithChildren {
  selectedCount: number
  onSendSelected?: () => void
}

export function SelectionHeader({ 
  selectedCount, 
  onSendSelected,
  children 
}: SelectionHeaderProps) {
  const t = useTranslations("user.proposedResponses")

  if (selectedCount <= 0) return null

  return (
    <header className="fixed top-16 left-0 right-0 z-40 w-full border-b border-border/40 bg-background h-16">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-end gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-sm mr-auto">
          <span className="text-muted-foreground">
            {t("actions.selectedCount", { count: selectedCount })}
          </span>
        </div>
        {onSendSelected && (
          <Button
            variant="default"
            className="h-10 bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90"
            onClick={onSendSelected}
            disabled
          >
            <Send className="h-4 w-4 mr-2" />
            {t("actions.sendSelected")}
          </Button>
        )}
        {children}
      </div>
    </header>
  )
}
