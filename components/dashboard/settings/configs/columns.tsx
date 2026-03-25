"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export type GlobalConfigRow = {
  id: string
  active: boolean
  created_at: string | null
  updated_at: string | null
  responder_model: string | null
  onboarding_model: string | null
}

const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return "—"
  return new Date(date).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function getGlobalConfigColumns(t: (key: string, values?: Record<string, string | number | Date>) => string, onView: (id: string) => void): ColumnDef<GlobalConfigRow>[] {
  return [
    {
      accessorKey: "created_at",
      header: t("createdAt"),
      cell: ({ row }) => formatDate(row.original.created_at),
    },
    {
      accessorKey: "responder_model",
      header: () => <div className="text-center">{t("responderModel")}</div>,
      cell: ({ row }) => {
        const model = row.original.responder_model
        return <div className="text-sm text-center">{model || "—"}</div>
      },
    },
    {
      accessorKey: "onboarding_model",
      header: () => <div className="text-center">{t("onboardingModel")}</div>,
      cell: ({ row }) => {
        const model = row.original.onboarding_model
        return <div className="text-sm text-center">{model || "—"}</div>
      },
    },
    {
      accessorKey: "active",
      header: () => <div className="text-center">{t("status")}</div>,
      cell: ({ row }) => {
        if (row.original.active) {
          return (
            <div className="flex justify-center">
              <Badge variant="default" className="bg-[var(--active)] text-[var(--active-foreground)] px-3 py-1 text-sm">
                {t("active")}
              </Badge>
            </div>
          )
        }
        return (
          <div className="flex justify-center">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => onView(row.original.id)}
            >
              {t("review")}
            </Button>
          </div>
        )
      }
    }
  ]
}
