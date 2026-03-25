import { getPaginatedLocations } from "@/server/actions/supabase/locations.action"
import { LocationsTableClient } from "@/components/dashboard/locations/LocationsTableClient"
import type { PaginationMeta } from "@/lib/api-types"
import type { SerializedLocationWithConnection } from "@/lib/prisma-types"
import type { location_status } from "@/app/generated/prisma"

interface LocationsTableServerProps {
  searchParams: Promise<{
    page?: string
    search?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    status?: string
  }>
}

// Server Component: resolves search params, fetches data, renders client table
export default async function LocationsTableServer({ searchParams }: LocationsTableServerProps) {
  const params = await searchParams

  const page = Math.max(1, Number(params.page) || 1)
  const search = params.search?.trim() || undefined
  const sortBy = params.sortBy || "reference"
  const sortOrder = params.sortOrder === "asc" ? "asc" : "desc"
  const status = params.status as location_status | undefined

  const result = await getPaginatedLocations({
    page,
    limit: 20,
    sortBy,
    sortOrder,
    search,
    status,
  })

  let locations: SerializedLocationWithConnection[] = []
  if (result.locations) {
    locations = result.locations
  }

  const pagination: PaginationMeta = {
    page: result.pagination.page,
    limit: result.pagination.limit,
    total: result.pagination.total,
    totalPages: result.pagination.totalPages,
    hasNext: result.pagination.hasNext,
    hasPrev: result.pagination.hasPrev,
  }

  return (
    <LocationsTableClient 
      locations={locations}
      pagination={pagination}
      currentSearch={search || ""}
      currentStatus={status}
    />
  )
}
