import { getPaginatedConnections } from "@/server/actions/supabase/connections.action"
import { ConnectionsTableClient } from "./ConnectionsTableClient"
import type { ConnectionWithRelations } from "./columns"
import type { PaginationMeta } from "@/lib/api-types"

interface ConnectionsTableServerProps {
  searchParams: Promise<{
    page?: string
    search?: string
    sortBy?: string
    sortOrder?: string
    status?: string
  }>
}

export default async function ConnectionsTableServer({ searchParams }: ConnectionsTableServerProps) {
  const params = await searchParams

  const page = Math.max(1, Number(params.page) || 1)
  const search = params.search?.trim() || undefined
  const sortBy = params.sortBy || "created_at"
  const sortOrder = params.sortOrder === "asc" ? "asc" : "desc"
  const status = params.status || undefined

  const limit = 20

  const result = await getPaginatedConnections({
    page,
    limit,
    search,
    sortBy,
    sortOrder,
    status,
  })

  const connections: ConnectionWithRelations[] = result.connections as unknown as ConnectionWithRelations[]
  
  const pagination: PaginationMeta = {
    page: result.pagination.page,
    limit: result.pagination.limit,
    total: result.pagination.total,
    totalPages: result.pagination.totalPages,
    hasNext: result.pagination.hasNext,
    hasPrev: result.pagination.hasPrev,
  }

  return (
    <ConnectionsTableClient 
      connections={connections}
      pagination={pagination}
      currentSearch={search ?? ""}
      currentStatus={status}
    />
  )
}

