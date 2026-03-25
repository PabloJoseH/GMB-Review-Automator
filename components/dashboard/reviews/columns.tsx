"use client"

/**
 * Reviews Table Columns Definition
 * 
 * Defines column structure for the reviews data table following TanStack Table patterns.
 * Includes columns for selection, author, rating, comment, location, review date, and actions.
 */

import { ColumnDef } from "@tanstack/react-table"
import { Eye, Star } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTableColumnHeader } from "@/components/dashboard/shared/table/data-table-column-header"
import { formatDate } from "@/lib/utils"
import type { reviews_responses_test } from "@/app/generated/prisma"

export type ReviewWithLocation = reviews_responses_test & {
  locations: { id: string; name: string | null } | null
}

interface ColumnsProps {
  t: (key: string) => string
  mode?: "client" | "server"
  onToggleSort?: (columnId: string, direction: "asc" | "desc") => void
  onViewDetails?: (review: ReviewWithLocation) => void
}

export function createReviewsColumns({ t, mode = "client", onToggleSort, onViewDetails }: ColumnsProps): ColumnDef<ReviewWithLocation>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="dark:data-[state=checked]:bg-[var(--active)] dark:data-[state=checked]:border-[var(--active)]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
          className="dark:data-[state=checked]:bg-[var(--active)] dark:data-[state=checked]:border-[var(--active)]"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "location",
      accessorFn: (row) => row.locations?.name ?? null,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("table.location")}
          mode={mode}
          onToggleSort={onToggleSort}
        />
      ),
      cell: ({ getValue }) => {
        const locationName = getValue() as string | null
        return (
          <div className="font-medium max-w-[200px] truncate" title={locationName || undefined}>
            {locationName || (
              <span className="text-muted-foreground italic">{t("table.unknownLocation")}</span>
            )}
          </div>
        )
      },
      enableSorting: true,
    },
    {
      accessorKey: "reviewer_name",
      id: "author",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("table.author")}
          mode={mode}
          onToggleSort={onToggleSort}
        />
      ),
      cell: ({ getValue }) => {
        const authorName = getValue() as string | null
        return (
          <div className="font-medium">
            {authorName || t("table.anonymous")}
          </div>
        )
      },
      enableSorting: true,
    },
    {
      accessorKey: "rating",
      id: "rating",
      header: ({ column }) => (
        <div className="text-center">
          <DataTableColumnHeader
            column={column}
            title={t("table.rating")}
            mode={mode}
            onToggleSort={onToggleSort}
          />
        </div>
      ),
      cell: ({ getValue }) => {
        const rating = getValue() as string | null
        if (!rating) {
          return <div className="text-center text-muted-foreground">—</div>
        }
        const numRating = parseInt(rating)
        const variant = numRating >= 4 ? "default" : numRating >= 3 ? "secondary" : "destructive"
        const bgColor = numRating >= 4 ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""
        return (
          <div className="flex justify-center">
            <Badge variant={variant} className={`flex items-center gap-1 w-fit ${bgColor}`}>
              <Star className="h-3 w-3 fill-current" />
              {rating}
            </Badge>
          </div>
        )
      },
      enableSorting: true,
    },
    {
      accessorKey: "comment",
      id: "hasComment",
      header: () => <div className="text-center">{t("table.hasComment")}</div>,
      cell: ({ getValue }) => {
        const comment = getValue() as string | null
        const hasComment = comment && comment.trim().length > 0
        return (
          <div className="flex justify-center">
            {hasComment ? (
              <Badge variant="secondary" className="bg-muted/50 text-foreground border-muted dark:bg-muted dark:text-foreground">
                {t("table.withComment")}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground border-0 bg-transparent">
                {t("table.noComment")}
              </Badge>
            )}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "create_time",
      id: "reviewDate",
      header: ({ column }) => (
        <div className="text-center">
          <DataTableColumnHeader
            column={column}
            title={t("table.reviewDate")}
            mode={mode}
            onToggleSort={onToggleSort}
          />
        </div>
      ),
      cell: ({ getValue }) => {
        const date = getValue() as Date | string | null
        return (
          <div className="text-sm text-muted-foreground text-center">
            {formatDate(date)}
          </div>
        )
      },
      sortingFn: "datetime",
      enableSorting: true,
    },
    {
      id: "actions",
      header: () => <div className="text-center">{t("table.actions")}</div>,
      cell: ({ row }) => (
        <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onViewDetails?.(row.original)}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("actions.view")}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ]
}

