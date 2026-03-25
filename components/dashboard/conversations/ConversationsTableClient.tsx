"use client"

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
import { createConversationsColumns, type SessionWithUser } from "./columns"
import type { PaginationMeta } from "@/lib/api-types"

interface ConversationsTableClientProps {
  sessions: SessionWithUser[]
  pagination: PaginationMeta
  currentSearch?: string
  thresholdTokens: number
}

export function ConversationsTableClient({ sessions, pagination, currentSearch, thresholdTokens }: ConversationsTableClientProps) {
  const t = useTranslations("backoffice.conversations")
  const tTime = useTranslations("common.time")
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])

  // Create columns with server mode for sorting
  const columns = useMemo<ColumnDef<SessionWithUser>[]>(
    () => createConversationsColumns({
      t,
      tTime,
      mode: "server",
      thresholdTokens,
      onToggleSort: (columnId: string, direction: "asc" | "desc") => {
        const params = new URLSearchParams(window.location.search)
        params.set("sortBy", columnId)
        params.set("sortOrder", direction)
        params.set("page", "1")
        router.push(`?${params.toString()}`)
      }
    }),
    [t, tTime, router, thresholdTokens]
  )

  const table = useReactTable({
    data: sessions,
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
        searchKey="user"
        mode="server"
        currentSearch={currentSearch}
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
            {t("actions.changeAgent")}
          </button>
          <button disabled className="inline-flex h-8 items-center rounded-md border px-3 text-sm opacity-60">
            {t("actions.archive")}
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

