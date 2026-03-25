"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  RowSelectionState,
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
import { TableToolbar } from "@/components/dashboard/shared/table/table-toolbar"
import { DataTablePagination } from "@/components/dashboard/shared/table/data-table-pagination"
import { SelectionBar } from "@/components/dashboard/shared/table/selection-bar"
import { createProposedResponsesColumns } from "./location-proposed-responses-columns"
import type { ProposedResponseWithLocation } from "@/lib/prisma-types"
import type { PaginationMeta } from "@/lib/api-types"

interface LocationProposedResponsesClientProps {
  responses: ProposedResponseWithLocation[]
  pagination: PaginationMeta
  locationId: string
  currentSearch: string
}

/**
 * LocationProposedResponsesClient - Client Component
 * 
 * Displays proposed responses in a table with server-side pagination, search, and sorting.
 * Supports row selection and bulk deletion.
 */
export function LocationProposedResponsesClient({ 
  responses, 
  pagination, 
  locationId,
  currentSearch
}: LocationProposedResponsesClientProps) {
  const t = useTranslations("backoffice.locations.detail.proposedResponses")
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [isPending, startTransition] = useTransition()
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false)

  const columns = useMemo(
    () => createProposedResponsesColumns({
      t,
      mode: "server",
      onToggleSort: (columnId: string, direction: "asc" | "desc") => {
        const params = new URLSearchParams(searchParams.toString())
        params.set("sortBy", columnId)
        params.set("sortOrder", direction)
        params.set("page", "1")
        router.push(`?${params.toString()}`)
      },
      onDelete: (responseId: string) => {
        // TODO: Implement single response deletion
        toast.info(`TODO: Delete single response with ID: ${responseId}`)
      }
    }),
    [t, router, searchParams]
  )

  const table = useReactTable({
    data: responses,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      rowSelection,
    },
    manualPagination: true,
    pageCount: pagination.totalPages,
    enableRowSelection: true,
    getRowId: (row) => row.id,
  })

  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const selectedResponseIds = table.getFilteredSelectedRowModel().rows.map(row => row.original.id)

  const handleBulkDelete = async () => {
    // TODO: Implement bulk delete action
    toast.info(`TODO: Delete selected responses: ${selectedResponseIds.join(', ')}`)
    setOpenDeleteDialog(false)
    setRowSelection({})
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Table Toolbar */}
      <TableToolbar
        searchKey="search"
        currentSearch={currentSearch}
        searchPlaceholder={t("table.reviewer")}
        mode="server"
      />

      {/* Table */}
      <div className="relative rounded-md border">
        <SelectionBar selectedCount={selectedCount} offsetLeft={40}>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setOpenDeleteDialog(true)}
            disabled={isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("actions.deleteSelected")}
          </Button>
        </SelectionBar>
        {responses.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              {t("empty")}
            </p>
          </div>
        ) : (
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
                    {t("empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      <DataTablePagination 
        pagination={pagination}
        mode="server"
      />

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
              onClick={handleBulkDelete} 
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

