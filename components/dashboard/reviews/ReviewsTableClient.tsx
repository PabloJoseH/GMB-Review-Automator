"use client"

/**
 * ReviewsTableClient - Client Component
 * 
 * Client-side table implementation for reviews using TanStack Table.
 * Handles sorting, filtering, and pagination with server-side data.
 */

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TableToolbar } from "@/components/dashboard/shared/table/table-toolbar"
import { DataTablePagination } from "@/components/dashboard/shared/table/data-table-pagination"
import { DataTableViewOptions } from "@/components/dashboard/shared/table/data-table-view-options"
import { SelectionBar } from "@/components/dashboard/shared/table/selection-bar"
import { ReviewDetailSheet } from "./review-detail-sheet"
import { createReviewsColumns, type ReviewWithLocation } from "./columns"
import type { PaginationMeta } from "@/lib/api-types"

interface ReviewsTableClientProps {
  reviews: ReviewWithLocation[]
  pagination: PaginationMeta
  currentSearch?: string
  currentCommentStatus?: string
  currentRating?: string
}

export function ReviewsTableClient({ reviews, pagination, currentSearch, currentCommentStatus, currentRating }: ReviewsTableClientProps) {
  const t = useTranslations("backoffice.reviews")
  const tFilters = useTranslations("backoffice.reviews.filters")
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [selectedReview, setSelectedReview] = useState<ReviewWithLocation | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const columns = useMemo<ColumnDef<ReviewWithLocation>[]>(
    () => createReviewsColumns({
      t,
      mode: "server",
      onToggleSort: (columnId: string, direction: "asc" | "desc") => {
        const params = new URLSearchParams(window.location.search)
        params.set("sortBy", columnId)
        params.set("sortOrder", direction)
        params.set("page", "1")
        router.push(`?${params.toString()}`)
      },
      onViewDetails: (review: ReviewWithLocation) => {
        setSelectedReview(review)
        setSheetOpen(true)
      }
    }),
    [t, router]
  )

  const table = useReactTable({
    data: reviews,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
    manualPagination: true,
    pageCount: pagination.totalPages,
    enableRowSelection: true,
  })

  // Filter options
  const commentStatusOptions = [
    { value: "with", label: tFilters("withComment"), icon: <span className="text-base">💬</span> },
    { value: "without", label: tFilters("noComment"), icon: <span className="text-base">🚫</span> },
  ]

  const ratingOptions = [
    { value: "5", label: tFilters("star5"), icon: <span className="text-base">⭐⭐⭐⭐⭐</span> },
    { value: "4", label: tFilters("star4"), icon: <span className="text-base">⭐⭐⭐⭐</span> },
    { value: "3", label: tFilters("star3"), icon: <span className="text-base">⭐⭐⭐</span> },
    { value: "2", label: tFilters("star2"), icon: <span className="text-base">⭐⭐</span> },
    { value: "1", label: tFilters("star1"), icon: <span className="text-base">⭐</span> },
  ]

  // Combine filter options - now supporting multiple filters
  const allFilters = [
    {
      key: "commentStatus",
      label: tFilters("commentStatus"),
      options: commentStatusOptions,
      currentValue: currentCommentStatus
    },
    {
      key: "rating",
      label: tFilters("rating"),
      options: ratingOptions,
      currentValue: currentRating
    }
  ]

  return (
    <>
      <div className="space-y-4">
        <TableToolbar
          searchPlaceholder={t("searchPlaceholder")}
          searchKey="author"
          mode="server"
          currentSearch={currentSearch}
          filterGroups={allFilters}
        >
          <DataTableViewOptions table={table} />
        </TableToolbar>

        <div className="relative rounded-md border">
          <SelectionBar
            selectedCount={table.getFilteredSelectedRowModel().rows.length}
            offsetLeft={40}
          >
            <button disabled className="inline-flex h-8 items-center rounded-md border px-3 text-sm opacity-60">
              {t("actions.export")}
            </button>
            <button disabled className="inline-flex h-8 items-center rounded-md border px-3 text-sm opacity-60">
              {t("actions.delete")}
            </button>
          </SelectionBar>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {t("noResults")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <DataTablePagination
          pagination={pagination}
          mode="server"
        />
      </div>

      {selectedReview && (
        <ReviewDetailSheet 
          review={selectedReview} 
          open={sheetOpen}
          onOpenChange={setSheetOpen}
        />
      )}
    </>
  )
}

