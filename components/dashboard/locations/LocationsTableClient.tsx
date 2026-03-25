"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { Check, X } from "lucide-react"
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
import { createLocationsColumns } from "./columns"
import type { SerializedLocationWithConnection } from "@/lib/prisma-types"
import type { PaginationMeta } from "@/lib/api-types"

interface LocationsTableClientProps {
  locations: SerializedLocationWithConnection[]
  pagination: PaginationMeta
  currentSearch?: string
  currentStatus?: string
}

export function LocationsTableClient({ locations, pagination, currentSearch, currentStatus }: LocationsTableClientProps) {
  const t = useTranslations("backoffice.locations")
  const tTime = useTranslations("common.time")
  const locale = useLocale()
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])

  // Create columns with server mode for sorting
  const columns = useMemo<ColumnDef<SerializedLocationWithConnection>[]>(
    () => createLocationsColumns({
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
    data: locations,
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

  const statusOptions = [
    { value: "active", label: t("status.active"), icon: <Check className="h-4 w-4" /> },
    { value: "inactive", label: t("status.inactive"), icon: <X className="h-4 w-4" /> },
  ]

  const handleRowClick = (location: SerializedLocationWithConnection) => {
    router.push(`/backoffice/locations/${location.id}`)
  }

  return (
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
        <SelectionBar
          selectedCount={table.getFilteredSelectedRowModel().rows.length}
          offsetLeft={36}
        >
          {/* Planned actions: disabled for now */}
          <button disabled className="inline-flex h-8 items-center rounded-md border px-3 text-sm opacity-60">
            {t("actions.changeStatus")}
          </button>
          <button disabled className="inline-flex h-8 items-center rounded-md border px-3 text-sm opacity-60">
            {t("actions.update")}
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
  )
}
