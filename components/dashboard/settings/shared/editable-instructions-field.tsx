"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { SquareArrowOutUpRight } from "lucide-react"

interface EditableInstructionsFieldProps {
  label: string
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  placeholder?: string
  height?: string
  className?: string
  fontMono?: boolean
}

export function EditableInstructionsField({
  label,
  value,
  onChange,
  readOnly = false,
  placeholder,
  height = "350px",
  className = "",
  fontMono = false,
}: EditableInstructionsFieldProps) {
  const t = useTranslations("backoffice.settings.active.instructionsDialog")
  const [open, setOpen] = useState(false)
  const [dialogValue, setDialogValue] = useState(value)

  // Sync dialog value when value prop changes
  useEffect(() => {
    if (!open) {
      setDialogValue(value)
    }
  }, [value, open])

  const handleOpen = () => {
    setDialogValue(value)
    setOpen(true)
  }

  const handleSave = () => {
    if (onChange && !readOnly) {
      onChange(dialogValue)
    }
    setOpen(false)
  }

  const handleClose = () => {
    setDialogValue(value) // Reset to original value
    setOpen(false)
  }

  return (
    <>
      <div className={`space-y-2 relative group ${className}`}>
        <Label>{label}</Label>
        <div className="relative w-full rounded-md border overflow-hidden" style={{ height }}>
          <ScrollArea className="h-full w-full">
            <Textarea
              value={value || ""}
              onChange={(e) => onChange && !readOnly ? onChange(e.target.value) : undefined}
              readOnly={readOnly}
              disabled={readOnly}
              className={`border-0 focus-visible:ring-0 resize-none w-full text-sm ${fontMono ? "font-mono" : ""}`}
              style={{ minHeight: height, padding: "12px" }}
              placeholder={placeholder}
            />
          </ScrollArea>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 hover:bg-muted/50 z-10 bg-background/80 backdrop-blur-sm border shadow-sm"
            onClick={handleOpen}
            title={readOnly ? t("viewTitle") : t("editTitle")}
          >
            <SquareArrowOutUpRight className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(o) => o ? handleOpen() : handleClose()}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              value={dialogValue || ""}
              onChange={(e) => setDialogValue(e.target.value)}
              readOnly={readOnly}
              disabled={readOnly}
              className={`w-full text-sm ${fontMono ? "font-mono" : ""}`}
              placeholder={placeholder || (readOnly ? t("noContent") : t("placeholder"))}
            />
          </div>
          <DialogFooter>
            {!readOnly && (
              <Button onClick={handleClose} variant="outline">
                {t("cancel")}
              </Button>
            )}
            <Button
              onClick={readOnly ? handleClose : handleSave}
              className={readOnly ? "" : "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90"}
            >
              {readOnly ? t("close") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}