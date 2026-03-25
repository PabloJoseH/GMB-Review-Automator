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
import { FileText } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DataTablePagination } from "@/components/dashboard/shared/table/data-table-pagination"
import { createPaymentsColumns } from "./payments-columns"
import type { OrganizationWithRelations, SerializedPayment } from "@/lib/prisma-types"
import type { PaginationMeta } from "@/lib/api-types"

interface OrganizationPaymentsClientProps {
  payments: SerializedPayment[]
  pagination: PaginationMeta
  organization: OrganizationWithRelations
}

/**
 * OrganizationPaymentsClient - Client Component
 * 
 * Displays payment records for an organization using TanStack Table.
 * Follows the standard table pattern with server-side pagination.
 * 
 * Architecture:
 * - Client Component: Receives data from OrganizationPaymentsServer
 * - Uses TanStack Table for rendering and state management
 * - Server-side pagination and sorting
 */
export function OrganizationPaymentsClient({ 
  payments, 
  pagination, 
  organization 
}: OrganizationPaymentsClientProps) {
  const t = useTranslations("backoffice.organizations.detail.payments")
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])

  // Create columns with server mode for sorting
  const columns = useMemo<ColumnDef<SerializedPayment>[]>(
    () => createPaymentsColumns({
      t,
      organization,
      mode: "server",
      onToggleSort: (columnId: string, direction: "asc" | "desc") => {
        const params = new URLSearchParams(window.location.search)
        params.set("sortBy", columnId)
        params.set("sortOrder", direction)
        params.set("page", "1")
        router.push(`?${params.toString()}`)
      },
    }),
    [t, organization, router]
  )

  const table = useReactTable({
    data: payments,
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
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t("title")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("count", { count: pagination.total })}
          </p>
        </div>
      </div>

      {/* Table */}
      {payments.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              {t("empty")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-md border">
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
                {table.getRowModel().rows.length ? (
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
          </div>

          {/* Pagination */}
          <DataTablePagination 
            pagination={pagination}
            mode="server"
          />
        </>
      )}
    </div>
  )
}

