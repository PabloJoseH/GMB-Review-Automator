"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { toast } from "sonner"
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
import { TableToolbar } from "@/components/dashboard/shared/table/table-toolbar"
import { DataTablePagination } from "@/components/dashboard/shared/table/data-table-pagination"
import { DataTableViewOptions } from "@/components/dashboard/shared/table/data-table-view-options"
import { SelectionBar } from "@/components/dashboard/shared/table/selection-bar"
import { createOrganizationsColumns } from "./columns"
import { deleteOrganization } from "@/server/actions/supabase/organizations.action"
import type { OrganizationWithLocationCounts } from "@/lib/prisma-types"
import type { PaginationMeta } from "@/lib/api-types"

interface OrganizationsTableClientProps {
  organizations: OrganizationWithLocationCounts[]
  pagination: PaginationMeta
  currentSearch?: string
}

/**
 * Overview: Organizations table client component
 * - Displays organizations in a table with server-side pagination and sorting
 * - Supports row selection (single organization deletion only)
 * - Handles organization deletion with confirmation dialog
 * - Refreshes data after successful deletion using router.refresh()
 */
export function OrganizationsTableClient({ organizations, pagination, currentSearch }: OrganizationsTableClientProps) {
  const t = useTranslations("backoffice.organizations")
  const locale = useLocale()
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [isPending, startTransition] = useTransition()
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false)

  const tTime = useTranslations("common.time")

  // Create columns with server mode for sorting
  const columns = useMemo<ColumnDef<OrganizationWithLocationCounts>[]>(
    () => createOrganizationsColumns({
      t,
      tTime,
      locale,
      mode: "server",
      onToggleSort: (columnId: string, direction: "asc" | "desc") => {
        const params = new URLSearchParams(window.location.search)
        params.set("sortBy", columnId)
        params.set("sortOrder", direction)
        params.set("page", "1")
        router.push(`?${params.toString()}`)
      }
    }),
    [t, tTime, locale, router]
  )

  const table = useReactTable({
    data: organizations,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
    // Disable client-side pagination since we use server-side
    manualPagination: true,
    pageCount: pagination.totalPages,
    enableRowSelection: true,
  })

  // Derived selection state
  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedOrganization = selectedRows.length === 1 ? selectedRows[0].original : null

  // Handle delete of single selected organization
  const handleDeleteSelected = async () => {
    if (!selectedOrganization) {
      toast.error(t("actions.deleteError") || "No organization selected")
      return
    }

    startTransition(async () => {
      try {
        const result = await deleteOrganization(selectedOrganization.id)
        
        if (result.success) {
          toast.success(t("actions.deleteSuccess") || "Organization deleted successfully")
          // Clear selection and refresh
          table.resetRowSelection()
          router.refresh()
        } else {
          toast.error(result.error || result.message || t("actions.deleteError") || "Failed to delete organization")
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("actions.deleteError") || "Failed to delete organization")
      }

      setOpenDeleteDialog(false)
    })
  }

  // Only show delete button if exactly one organization is selected
  const bulkActions = useMemo(() => (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpenDeleteDialog(true)}
        disabled={isPending || selectedCount !== 1}
        className="h-8"
      >
        {t("actions.delete")}
      </Button>
    </>
  ), [t, isPending, selectedCount])

  const handleRowClick = (organization: OrganizationWithLocationCounts) => {
    router.push(`/backoffice/organizations/${organization.id}`)
  }

  return (
    <>
      <div className="space-y-4">
        <TableToolbar
          searchPlaceholder={t("searchPlaceholder")}
          searchKey="business_name"
          mode="server"
          currentSearch={currentSearch}
        >
          <DataTableViewOptions table={table} />
        </TableToolbar>

        <div className="relative rounded-md border">
          {selectedCount > 0 && (
            <SelectionBar selectedCount={selectedCount} offsetLeft={42}>
              {bulkActions}
            </SelectionBar>
          )}
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
                    onClick={() => handleRowClick(row.original)}
                    className="group/row cursor-pointer hover:bg-muted/50 transition-colors"
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("actions.deleteConfirmTitle") || "Delete Organization"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedOrganization && (
                <>
                  {t("actions.deleteConfirmDescription") || "Are you sure you want to delete this organization? This action cannot be undone and will also cancel any active subscriptions."}
                  <br />
                  <br />
                  <strong>{selectedOrganization.business_name}</strong>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t("actions.cancel") || "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {isPending
                ? t("actions.deleting") || "Deleting..."
                : t("actions.delete") || "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
