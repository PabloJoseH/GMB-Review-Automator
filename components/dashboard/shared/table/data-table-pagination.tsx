"use client"

import { Table } from "@tanstack/react-table"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"
import type { PaginationMeta } from "@/lib/api-types"

interface DataTablePaginationProps<TData> {
  table?: Table<TData>
  pagination?: PaginationMeta
  mode?: "client" | "server"
  onPageChange?: (page: number) => void
}

export function DataTablePagination<TData>({
  table,
  pagination,
  mode = "client",
  onPageChange,
}: DataTablePaginationProps<TData>) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations("backoffice.shared.table")

  // Client mode: use table instance
  if (mode === "client" && table) {
    return (
      <div className="flex items-center justify-center space-x-2 px-2">
        <div className="flex w-[140px] items-center justify-center text-sm font-medium">
          {t("pageOf", { page: table.getState().pagination.pageIndex + 1, total: table.getPageCount() })}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    )
  }

  // Server mode: use pagination meta
  if (mode === "server" && pagination) {
    const handlePageChange = (newPage: number) => {
      if (onPageChange) {
        onPageChange(newPage)
      } else {
        const params = new URLSearchParams(searchParams.toString())
        params.set("page", newPage.toString())
        router.push(`?${params.toString()}`)
      }
    }

    return (
      <div className="flex items-center justify-between px-2">
        <div className="text-muted-foreground flex-1 text-sm">
          {t("showing", {
            from: ((pagination.page - 1) * pagination.limit) + 1,
            to: Math.min(pagination.page * pagination.limit, pagination.total),
            total: pagination.total
          })}
        </div>
        <div className="flex items-center space-x-6 lg:space-x-8">
          <div className="flex w-[140px] items-center justify-center text-sm font-medium">
            {t("pageOf", { page: pagination.page, total: pagination.totalPages })}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              className="hidden size-8 lg:flex"
              onClick={() => handlePageChange(1)}
              disabled={!pagination.hasPrev}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={!pagination.hasPrev}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={!pagination.hasNext}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="hidden size-8 lg:flex"
              onClick={() => handlePageChange(pagination.totalPages)}
              disabled={!pagination.hasNext}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRight />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
