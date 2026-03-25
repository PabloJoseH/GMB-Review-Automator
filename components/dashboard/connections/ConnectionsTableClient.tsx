"use client"

import { useMemo, useState, useTransition, useCallback } from "react"
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
import { createConnectionsColumns, type ConnectionWithRelations } from "./columns"
import type { PaginationMeta } from "@/lib/api-types"
import { refreshSingleAccount } from "@/server/actions/gmb/pub-sub.action"
import { toast } from "sonner"

interface ConnectionsTableClientProps {
  connections: ConnectionWithRelations[]
  pagination: PaginationMeta
  currentSearch?: string
  currentStatus?: string
}

export function ConnectionsTableClient({ connections, pagination, currentSearch, currentStatus }: ConnectionsTableClientProps) {
  const t = useTranslations("backoffice.connections")
  const tc = useTranslations("backoffice.users.detail.connections")
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [, startTransition] = useTransition()

  const statusOptions = [
    {
      value: "active",
      label: t("table.active"),
    },
    {
      value: "inactive",
      label: t("table.inactive"),
    },
  ]

  const handleRefresh = useCallback(async (externalAccountId: string, userId: string) => {
    startTransition(async () => {
      try {
        const result = await refreshSingleAccount(externalAccountId, userId)
        if (result?.success) {
          toast.success(tc("refreshSuccess"))
          router.refresh()
        } else {
          toast.error(result?.message || tc("refreshError"))
        }
      } catch {
        toast.error(tc("refreshError"))
      }
    })
  }, [tc, router])

  // Create columns with server mode for sorting
  const columns = useMemo<ColumnDef<ConnectionWithRelations>[]>(
    () => createConnectionsColumns({
      t,
      mode: "server",
      onToggleSort: (columnId: string, direction: "asc" | "desc") => {
        const params = new URLSearchParams(window.location.search)
        params.set("sortBy", columnId)
        params.set("sortOrder", direction)
        params.set("page", "1")
        router.push(`?${params.toString()}`)
      },
      onRefresh: handleRefresh
    }),
    [t, router, handleRefresh]
  )

  const table = useReactTable({
    data: connections,
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

  return (
    <div className="space-y-4">
      <TableToolbar
        searchPlaceholder={t("searchPlaceholder")}
        searchKey="connection"
        mode="server"
        currentSearch={currentSearch}
        currentStatus={currentStatus}
        statusOptions={statusOptions}
      >
        <DataTableViewOptions table={table} />
      </TableToolbar>

      <div className="relative rounded-md border">
        {/* Selection bar header */}
        <SelectionBar
          selectedCount={table.getFilteredSelectedRowModel().rows.length}
          offsetLeft={40}
        >
          {/* Planned actions: disabled for now */}
          <button disabled className="inline-flex h-8 items-center rounded-md border px-3 text-sm opacity-60">
            {t("actions.bulkRefresh")}
          </button>
          <button disabled className="inline-flex h-8 items-center rounded-md border px-3 text-sm opacity-60">
            {t("actions.bulkConfigure")}
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
  )
}

