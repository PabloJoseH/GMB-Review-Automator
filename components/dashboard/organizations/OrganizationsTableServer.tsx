import { getOrganizationsWithLocationCounts } from "@/server/actions/supabase/organizations.action"
import { OrganizationsTableClient } from "@/components/dashboard/organizations/OrganizationsTableClient"
import type { PaginationMeta } from "@/lib/api-types"
import type { OrganizationWithLocationCounts } from "@/lib/prisma-types"

interface OrganizationsTableServerProps {
  searchParams: Promise<{
    page?: string
    search?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }>
}

// Server Component: resolves search params, fetches data, renders client table
export default async function OrganizationsTableServer({ searchParams }: OrganizationsTableServerProps) {
  const params = await searchParams

  const page = Math.max(1, Number(params.page) || 1)
  const search = params.search?.trim() || undefined
  const sortBy = params.sortBy || "reference"
  const sortOrder = params.sortOrder === "asc" ? "asc" : "desc"

  const result = await getOrganizationsWithLocationCounts({
    page,
    limit: 20,
    sortBy,
    sortOrder,
    search,
  })

  let organizations: OrganizationWithLocationCounts[] = []
  if (result.success && result.data) {
    organizations = result.data.organizations as OrganizationWithLocationCounts[]
  }

  const pagination: PaginationMeta = result.success
    ? result.pagination
    : {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      }

  return (
    <OrganizationsTableClient 
      organizations={organizations}
      pagination={pagination}
      currentSearch={search || ""}
    />
  )
}
