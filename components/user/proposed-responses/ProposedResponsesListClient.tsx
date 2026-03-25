"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  RowSelectionState,
} from "@tanstack/react-table"
import { TableToolbar } from "@/components/dashboard/shared/table/table-toolbar"
import { DataTablePagination } from "@/components/dashboard/shared/table/data-table-pagination"
import { SelectionHeader } from "./selection-header"
import { ProposedResponseCard } from "./ProposedResponseCard"
import { LocationFilter } from "./location-filter"
import type { PaginationMeta } from "@/lib/api-types"
import type { ProposedResponseWithLocation } from "@/lib/prisma-types"
import { createLogger } from "@/lib/logger"

const logger = createLogger('PROPOSED_RESPONSES_CLIENT')

/**
 * ProposedResponsesListClient - Client Component
 * 
 * Renders proposed responses as cards using TanStack Table for:
 * - Row selection
 * - Server-side pagination
 * - Server-side sorting
 * 
 * Uses TanStack Table internally for state management but renders Cards instead of Table.
 */

interface ProposedResponsesListClientProps {
  responses: ProposedResponseWithLocation[]
  pagination: PaginationMeta
  currentLocationId?: string
  locations: Array<{ id: string; name: string | null }>
  currentSearch?: string
  now: Date
  clerkUserId?: string
}

export function ProposedResponsesListClient({ 
  responses, 
  pagination, 
  currentLocationId,
  locations,
  currentSearch,
  now,
  clerkUserId
}: ProposedResponsesListClientProps) {
  const t = useTranslations("user.proposedResponses")
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  // Create columns only for TanStack Table state management (not rendered as table)
  const columns = useMemo<ColumnDef<ProposedResponseWithLocation>[]>(
    () => [
      {
        id: "select",
        // Column definition needed for row selection, but not rendered
      },
      {
        accessorKey: "created_at",
        id: "created_at",
        // Column definition needed for sorting, but not rendered
      },
    ],
    []
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
    // Server-side pagination
    manualPagination: true,
    pageCount: pagination.totalPages,
    enableRowSelection: true,
    // Use row ID for selection
    getRowId: (row) => row.id,
  })

  const selectedRows = table.getFilteredSelectedRowModel().rows

  const handleLocationChange = (locationId: string | null) => {
    const params = new URLSearchParams(window.location.search)
    if (!locationId || locationId === "all") {
      params.delete("locationId")
    } else {
      params.set("locationId", locationId)
    }
    params.set("page", "1")
    router.push(`?${params.toString()}`)
  }

  const handleSendSelected = async () => {
    if (!clerkUserId) {
      logger.error('Cannot send responses: clerkUserId is missing')
      return
    }

    if (selectedRows.length === 0) {
      logger.warn('No responses selected to send')
      return
    }

    try {
      const { sendProposedResponsesToGmb } = await import('@/server/actions/supabase/proposed-responses.action')
      const responseIds = selectedRows.map(r => r.original.id)
      
      logger.debug('Sending selected responses', { count: responseIds.length })
      
      const result = await sendProposedResponsesToGmb(clerkUserId, responseIds)
      
      if (result.success) {
        // Refresh the page to show updated status
        router.refresh()
        // Clear selection after successful send
        setRowSelection({})
      } else {
        logger.error('Failed to send responses', { error: result.error })
        // Show error message to user (you could use a toast here)
        alert(result.message) // Replace with toast notification
      }
    } catch (error) {
      logger.error('Error sending responses', error)
      alert('Error sending responses') // Replace with toast notification
    }
  }

  return (
    <>
      <SelectionHeader
        selectedCount={selectedRows.length}
        onSendSelected={handleSendSelected}
      />

      <div className="space-y-4">
        {/* Toolbar with search and location filter */}
        <TableToolbar
          searchPlaceholder={t("searchPlaceholder")}
          searchKey="reviewer"
          mode="server"
          currentSearch={currentSearch}
        >
          <LocationFilter
            locations={locations}
            currentLocationId={currentLocationId}
            onLocationChange={handleLocationChange}
          />
        </TableToolbar>

        {/* Cards List */}
        {table.getRowModel().rows?.length ? (
          <div className="space-y-4">
            {table.getRowModel().rows.map((row) => {
              const response = row.original
              return (
                <ProposedResponseCard
                  key={row.id}
                  response={response}
                  selected={row.getIsSelected()}
                  onSelect={() => row.toggleSelected()}
                  now={now}
                  clerkUserId={clerkUserId}
                />
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border p-12 text-center">
            <p className="text-muted-foreground">{t("noResults")}</p>
          </div>
        )}

        {/* Pagination */}
        <DataTablePagination
          pagination={pagination}
          mode="server"
        />
      </div>
    </>
  )
}
