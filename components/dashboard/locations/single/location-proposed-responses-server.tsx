import { getTranslations } from "next-intl/server"
import { getPaginatedProposedResponses } from "@/server/actions/supabase/proposed-responses.action"
import { LocationProposedResponsesClient } from "./location-proposed-responses-client"
import type { PaginationMeta } from "@/lib/api-types"
import type { ProposedResponseWithLocation } from "@/lib/prisma-types"

interface LocationProposedResponsesServerProps {
  location: { id: string }
  searchParams: Promise<{
    page?: string
    search?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }>
  locale: string
}

/**
 * LocationProposedResponsesServer - Server Component
 * 
 * Fetches paginated proposed responses for a specific location and passes them to the client component.
 * Handles URL search parameters for pagination, search, and sorting.
 */
export async function LocationProposedResponsesServer({ 
  location, 
  searchParams,
  locale
}: LocationProposedResponsesServerProps) {
  const t = await getTranslations({ locale, namespace: "backoffice.locations.detail.proposedResponses" })
  const params = await searchParams

  const page = Math.max(1, Number(params.page) || 1)
  const search = params.search?.trim() || undefined
  const sortBy = params.sortBy || "created_at"
  const sortOrder = params.sortOrder === "asc" ? "asc" : "desc"

  const result = await getPaginatedProposedResponses({
    page,
    limit: 20,
    locationId: location.id,
    sortBy: sortBy as 'created_at' | 'updated_at' | 'create_time',
    sortOrder,
    reviewerName: search,
  })

  const responses: ProposedResponseWithLocation[] = result.success && result.data 
    ? result.data.responses.map(r => ({
        ...r,
        location: r.locations ? {
          id: r.locations.id,
          name: r.locations.name
        } : null
      })) as ProposedResponseWithLocation[]
    : []

  const pagination: PaginationMeta = result.success && result.data
    ? result.data.pagination
    : {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      }

  return (
    <LocationProposedResponsesClient 
      responses={responses}
      pagination={pagination}
      locationId={location.id}
      currentSearch={search || ""}
    />
  )
}

