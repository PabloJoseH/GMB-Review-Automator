"use client"

import { useMemo, useState, useEffect, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { getConnectionLocationsPaginated } from "@/server/actions/supabase/connections.action"
import { Skeleton } from "@/components/ui/skeleton"

interface ConnectionLocationsRow {
  id: string
  name: string | null
  status: "active" | "inactive" | string | null
}

interface Props {
  connectionId: string
  initialLocations: { id: string; name: string | null; status: string | null }[]
  totalCount: number
}

export function ConnectionLocationsTable({ connectionId, initialLocations, totalCount }: Props) {
  const [currentPage, setCurrentPage] = useState(1)
  const [isPending, startTransition] = useTransition()
  const [locations, setLocations] = useState<ConnectionLocationsRow[]>(
    initialLocations.map(loc => ({
      id: loc.id,
      name: loc.name,
      status: loc.status || "inactive"
    }))
  )
  const pageSize = 10
  const totalPages = Math.ceil(totalCount / pageSize)
  const t = useTranslations("backoffice.users.detail.connections.locations")
  const router = useRouter()

  // Fetch locations when page changes (skip initial page since we have initialLocations)
  useEffect(() => {
    if (currentPage === 1) return // Skip initial page, we already have the data
    
    startTransition(async () => {
      const result = await getConnectionLocationsPaginated(connectionId, currentPage, pageSize)
      setLocations(result.locations.map(loc => ({
        id: loc.id,
        name: loc.name,
        status: loc.status || "inactive"
      })))
    })
  }, [connectionId, currentPage, pageSize])

  const columns = useMemo<ColumnDef<ConnectionLocationsRow>[]>(() => [
    {
      accessorKey: "name",
      header: () => t("table.name"),
      cell: ({ getValue }) => <div className="font-medium">{(getValue() as string) || "—"}</div>,
    },
    {
      accessorKey: "status",
      header: () => t("table.status"),
      cell: ({ getValue }) => {
        const status = (getValue() as string) || "inactive"
        const active = status === "active"
        return (
          <Badge variant={active ? "default" : "secondary"} className={active ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""}>
            {active ? t("status.active") : t("status.inactive")}
          </Badge>
        )
      },
    },
    {
      id: "view",
      header: () => t("table.actions"),
      cell: ({ row }) => (
        <Button 
          variant="link" 
          className="px-0 text-[var(--active)] hover:text-[var(--active)]/90" 
          onClick={() => router.push(`/backoffice/locations/${row.original.id}`)}
        >
          {t("actions.view")} »
        </Button>
      ),
    },
  ], [router, t])

  const table = useReactTable({
    data: locations,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  })

  const handleFirstPage = () => setCurrentPage(1)
  const handlePreviousPage = () => setCurrentPage(prev => Math.max(1, prev - 1))
  const handleNextPage = () => setCurrentPage(prev => Math.min(totalPages, prev + 1))
  const handleLastPage = () => setCurrentPage(totalPages)

  if (isPending && locations.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.name")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  if (totalCount === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.name")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                  {t("empty")}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {t("pagination.page", { 
              page: currentPage, 
              total: totalPages 
            })}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFirstPage}
              disabled={currentPage === 1 || isPending}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={currentPage === 1 || isPending}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage === totalPages || isPending}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLastPage}
              disabled={currentPage === totalPages || isPending}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}


