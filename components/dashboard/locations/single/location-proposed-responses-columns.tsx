"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Eye, Trash2, Star } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTableColumnHeader } from "@/components/dashboard/shared/table/data-table-column-header"
import { formatDate } from "@/lib/utils"
import type { ProposedResponseWithLocation } from "@/lib/prisma-types"

interface ColumnsProps {
  t: (key: string) => string
  mode?: "client" | "server"
  onToggleSort?: (columnId: string, direction: "asc" | "desc") => void
  onDelete?: (responseId: string) => void
}

export function createProposedResponsesColumns({ t, mode = "server", onToggleSort, onDelete }: ColumnsProps): ColumnDef<ProposedResponseWithLocation>[] {
  const getRatingBadge = (rating: string | null) => {
    if (!rating) return null
    const numRating = parseInt(rating)
    if (isNaN(numRating)) return null
    const variant = numRating >= 4 ? "default" : numRating >= 3 ? "secondary" : "destructive"
    const bgColor = numRating >= 4 ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""
    return (
      <Badge variant={variant} className={`flex items-center gap-1 w-fit text-xs ${bgColor}`}>
        <Star className="h-3 w-3 fill-current" />
        {numRating}
      </Badge>
    )
  }

  const truncateText = (text: string | null, maxLength: number): string => {
    if (!text) return "—"
    if (text.length <= maxLength) return text
    return `${text.substring(0, maxLength)}...`
  }

  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          className="dark:data-[state=checked]:bg-[var(--active)] dark:data-[state=checked]:border-[var(--active)]"
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          className="dark:data-[state=checked]:bg-[var(--active)] dark:data-[state=checked]:border-[var(--active)]"
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "create_time",
      id: "date",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("table.date")}
          mode={mode}
          onToggleSort={onToggleSort}
        />
      ),
      cell: ({ getValue }) => (
        <div className="text-xs text-muted-foreground">
          {getValue() ? formatDate(getValue() as Date) : "—"}
        </div>
      ),
      sortingFn: "datetime",
      enableSorting: true,
    },
    {
      accessorKey: "reviewer_name",
      id: "reviewer",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("table.reviewer")}
          mode={mode}
          onToggleSort={onToggleSort}
        />
      ),
      cell: ({ getValue }) => (
        <div className="text-sm font-medium">
          {truncateText(getValue() as string || t("table.anonymous"), 20)}
        </div>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "rating",
      id: "rating",
      header: () => <div className="text-center">{t("table.rating")}</div>,
      cell: ({ getValue }) => {
        const rating = getValue() as string | null
        return (
          <div className="flex justify-center">
            {getRatingBadge(rating)}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "comment",
      id: "comment",
      header: () => t("table.comment"),
      cell: ({ getValue }) => (
        <p className="line-clamp-1 text-sm">
          {truncateText(getValue() as string | null, 30)}
        </p>
      ),
      enableSorting: false,
    },
    {
      accessorKey: "response",
      id: "response",
      header: () => t("table.response"),
      cell: ({ getValue }) => (
        <p className="line-clamp-1 text-sm text-muted-foreground">
          {getValue() ? truncateText(getValue() as string, 30) : t("table.noResponse")}
        </p>
      ),
      enableSorting: false,
    },
    {
      id: "actions",
      header: () => <div className="text-center">{t("table.actions")}</div>,
      cell: ({ row }) => (
        <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Eye className="h-4 w-4" />
                <span className="sr-only">{t("actions.view")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("actions.view")}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                onClick={() => onDelete?.(row.original.id)}
                disabled // TODO: Implement delete action
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">{t("actions.delete")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("actions.delete")}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      ),
      enableSorting: false,
    },
  ]
}

