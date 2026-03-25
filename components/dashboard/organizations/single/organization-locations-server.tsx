import { getPaginatedLocations } from "@/server/actions/supabase/locations.action"
import { OrganizationLocationsClient } from "./organization-locations-client"
import type { OrganizationWithRelations } from "@/lib/prisma-types"
import type { PaginationMeta } from "@/lib/api-types"

interface OrganizationLocationsServerProps {
  organization: OrganizationWithRelations
  searchParams: Promise<{ page?: string }>
}

export async function OrganizationLocationsServer({ 
  organization, 
  searchParams 
}: OrganizationLocationsServerProps) {
  const params = await searchParams
  
  const pageParam = params.page
  const page = pageParam && !isNaN(Number(pageParam))
    ? Math.max(1, Number(pageParam))
    : 1

  const result = await getPaginatedLocations({
    page,
    limit: 20,
    organizationId: organization.id,
    sortBy: "created_at",
    sortOrder: "desc",
  })

  const locations = result.locations || []
  
  const pagination: PaginationMeta = {
    page: result.pagination.page,
    limit: result.pagination.limit,
    total: result.pagination.total,
    totalPages: result.pagination.totalPages,
    hasNext: result.pagination.hasNext,
    hasPrev: result.pagination.hasPrev,
  }

  return (
    <OrganizationLocationsClient 
      locations={locations}
      pagination={pagination}
      organization={organization}
    />
  )
}

