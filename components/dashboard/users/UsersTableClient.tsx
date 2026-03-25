"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check } from "lucide-react"
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
import { createUsersColumns } from "./columns"
import { deleteUser } from "@/server/actions/supabase/users.action"
import type { UserWithLocationsCount } from "@/lib/prisma-types"
import type { PaginationMeta } from "@/lib/api-types"

interface UsersTableClientProps {
  users: UserWithLocationsCount[]
  pagination: PaginationMeta
  currentStatus?: string
  currentSearch?: string
}

/**
 * Overview: Users table client component
 * - Displays users in a table with server-side pagination and sorting
 * - Supports row selection (single user deletion only)
 * - Handles user deletion with confirmation dialog
 * - Refreshes data after successful deletion using router.refresh()
 */
export function UsersTableClient({ users, pagination, currentStatus, currentSearch }: UsersTableClientProps) {
  const t = useTranslations("backoffice.users")
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [isPending, startTransition] = useTransition()
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false)

  // Create columns with server mode for sorting
  const columns = useMemo<ColumnDef<UserWithLocationsCount>[]>(
    () => createUsersColumns({
      t,
      mode: "server",
      onToggleSort: (columnId: string, direction: "asc" | "desc") => {
        const params = new URLSearchParams(window.location.search)
        params.set("sortBy", columnId)
        params.set("sortOrder", direction)
        params.set("page", "1")
        router.push(`?${params.toString()}`)
      }
    }),
    [t, router]
  )

  const table = useReactTable({
    data: users,
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
  const selectedUser = selectedRows.length === 1 ? selectedRows[0].original : null

  // Handle delete of single selected user
  const handleDeleteSelected = async () => {
    if (!selectedUser) {
      toast.error(t("actions.deleteError") || "No user selected")
      return
    }

    startTransition(async () => {
      try {
        const result = await deleteUser(selectedUser.id)
        
        if (result.success) {
          toast.success(t("actions.deleteSuccess") || "User deleted successfully")
          // Clear selection and refresh
          table.resetRowSelection()
          router.refresh()
        } else {
          toast.error(result.error || result.message || t("actions.deleteError") || "Failed to delete user")
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("actions.deleteError") || "Failed to delete user")
      }

      setOpenDeleteDialog(false)
    })
  }

  // Only show delete button if exactly one user is selected
  const bulkActions = useMemo(() => (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpenDeleteDialog(true)}
        disabled={isPending || selectedCount !== 1}
        className="h-8"
      >
        {t("actions.delete")}
      </Button>
    </div>
  ), [t, isPending, selectedCount])

  const statusOptions = [
    { value: "done", label: t("filters.done"), icon: <Check className="h-4 w-4" /> },
    { value: "inProgress", label: t("filters.inProgress"), icon: <span className="text-base">👤</span> },
  ]

  const handleRowClick = (user: UserWithLocationsCount) => {
    router.push(`/backoffice/users/${user.id}`)
  }

  return (
    <>
      <div className="space-y-4">
        <TableToolbar
          searchPlaceholder={t("searchPlaceholder")}
          searchKey="name"
          mode="server"
          currentSearch={currentSearch}
          currentStatus={currentStatus}
          statusOptions={statusOptions}
        >
          <DataTableViewOptions table={table} />
        </TableToolbar>

        <div className="relative rounded-md border">
          {/* Selection bar header */}
          {selectedCount > 0 && (
            <SelectionBar selectedCount={selectedCount} offsetLeft={44}>{bulkActions}</SelectionBar>
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
              {t("actions.deleteConfirmTitle") || "Delete User"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedUser && (
                <>
                  {t("actions.deleteConfirmDescription") || "Are you sure you want to delete this user? This action cannot be undone."}
                  <br />
                  <br />
                  <strong>
                    {selectedUser.name && selectedUser.lastname
                      ? `${selectedUser.name} ${selectedUser.lastname}`
                      : selectedUser.email || selectedUser.username || selectedUser.id}
                  </strong>
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
