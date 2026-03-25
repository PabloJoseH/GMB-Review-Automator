"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { RefreshCw, Trash2 } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DataTablePagination } from "@/components/dashboard/shared/table/data-table-pagination"
import { SelectionBar } from "@/components/dashboard/shared/table/selection-bar"
import { createExampleReviewsColumns } from "./example-reviews-columns"
import type { example_reviews } from "@/app/generated/prisma"
import type { PaginationMeta } from "@/lib/api-types"

interface ExampleReviewsTableClientProps {
  reviews: example_reviews[]
  pagination: PaginationMeta
}

/**
 * ExampleReviewsTableClient - Client Component
 * 
 * Displays example reviews in a table with server-side pagination and sorting.
 * Supports row selection and bulk deletion.
 */
export function ExampleReviewsTableClient({ 
  reviews, 
  pagination
}: ExampleReviewsTableClientProps) {
  const t = useTranslations("backoffice.locations.detail.promptContext.exampleReviews")
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sorting, setSorting] = useState<SortingState>([])
  const [isPending] = useTransition()
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false)

  const handleDeleteSelected = async () => {
    // TODO: Implement delete action
    toast.info("Funcionalidad de eliminación en desarrollo")
    setOpenDeleteDialog(false)
  }

  const handleFetchReviews = async () => {
    // TODO: Implement fetch reviews action
    toast.info("Funcionalidad de recuperar reseñas en desarrollo")
  }

  const columns = useMemo<ColumnDef<example_reviews>[]>(
    () => createExampleReviewsColumns({
      t,
      mode: "server",
      onToggleSort: (columnId: string, direction: "asc" | "desc") => {
        const params = new URLSearchParams(searchParams.toString())
        params.set("sortBy", columnId)
        params.set("sortOrder", direction)
        params.set("page", "1")
        router.push(`?${params.toString()}`)
      },
      onDelete: () => {
        // TODO: Implement single delete
        toast.info("Funcionalidad de eliminación en desarrollo")
      }
    }),
    [t, router, searchParams]
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

  const selectedCount = table.getFilteredSelectedRowModel().rows.length

  return (
    <div className="space-y-4">
      {/* Title and Actions */}
      <div className="flex items-center justify-between px-2">
        <div>
          <h4 className="text-base font-semibold">{t("title")}</h4>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleFetchReviews}
          disabled={true}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("fetchReviews")}
        </Button>
      </div>

      {/* Table */}
      <div className="relative rounded-md border">
        <SelectionBar selectedCount={selectedCount} offsetLeft={40}>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setOpenDeleteDialog(true)}
            disabled={selectedCount === 0 || isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("actions.deleteSelected")}
          </Button>
        </SelectionBar>

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
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
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      {t("empty")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("emptyDescription")}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.total > 0 && (
        <DataTablePagination 
          pagination={pagination}
          mode="server"
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialog.description", { count: selectedCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("deleteDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? t("deleteDialog.deleting") : t("deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

