"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Eye, Trash2, Star } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTableColumnHeader } from "@/components/dashboard/shared/table/data-table-column-header"
import { ReviewDetailDialog } from "./dialogs/review-detail-dialog"
import { formatDate } from "@/lib/utils"
import type { example_reviews } from "@/app/generated/prisma"

interface ColumnsProps {
  t: (key: string) => string
  mode?: "client" | "server"
  onToggleSort?: (columnId: string, direction: "asc" | "desc") => void
  onDelete?: (reviewId: string) => void
}

export function createExampleReviewsColumns({ t, mode = "server", onToggleSort, onDelete }: ColumnsProps): ColumnDef<example_reviews>[] {
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
      accessorKey: "review_time",
      id: "date",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("table.date")}
          mode={mode}
          onToggleSort={onToggleSort}
        />
      ),
      cell: ({ getValue }) => {
        const date = getValue() as Date | string | null
        return (
          <div className="text-sm text-muted-foreground">
            {date ? formatDate(date) : "—"}
          </div>
        )
      },
      sortingFn: "datetime",
      enableSorting: true,
    },
    {
      accessorKey: "author_name",
      id: "author",
      header: () => t("table.author"),
      cell: ({ getValue }) => {
        const author = getValue() as string | null
        return (
          <div className="text-sm font-medium">
            {author || t("table.anonymous")}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "rating",
      id: "rating",
      header: () => <div className="text-center">{t("table.rating")}</div>,
      cell: ({ getValue }) => {
        const rating = getValue() as number | null
        if (!rating) return <div className="text-center">—</div>
        const variant = rating >= 4 ? "default" : rating >= 3 ? "secondary" : "destructive"
        const bgColor = rating >= 4 ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""
        return (
          <div className="flex justify-center">
            <Badge variant={variant} className={`flex items-center gap-1 w-fit text-xs ${bgColor}`}>
              <Star className="h-3 w-3 fill-current" />
              {rating}
            </Badge>
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "comment",
      id: "comment",
      header: () => t("table.comment"),
      cell: ({ getValue }) => {
        const comment = getValue() as string | null
        if (!comment) return <div className="text-sm text-muted-foreground">—</div>
        const truncated = comment.length > 30 ? `${comment.substring(0, 30)}...` : comment
        return (
          <div className="text-sm line-clamp-1">{truncated}</div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "response",
      id: "response",
      header: () => t("table.response"),
      cell: ({ getValue }) => {
        const response = getValue() as string | null
        if (!response) {
          return (
            <div className="text-xs text-muted-foreground">{t("table.noResponse")}</div>
          )
        }
        const truncated = response.length > 30 ? `${response.substring(0, 30)}...` : response
        return (
          <div className="text-sm text-muted-foreground line-clamp-1">{truncated}</div>
        )
      },
      enableSorting: false,
    },
    {
      id: "actions",
      header: () => <div className="text-center">{t("table.actions")}</div>,
      cell: ({ row }) => (
        <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip>
            <ReviewDetailDialog review={row.original}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
            </ReviewDetailDialog>
            <TooltipContent>
              <p>{t("actions.view")}</p>
            </TooltipContent>
          </Tooltip>
          {onDelete && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => onDelete(row.original.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("actions.delete")}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
      enableSorting: false,
    },
  ]
}

