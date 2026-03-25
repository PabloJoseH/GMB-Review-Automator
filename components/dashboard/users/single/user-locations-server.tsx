import { getPaginatedLocations } from "@/server/actions/supabase/locations.action"
import { UserLocationsClient } from "./user-locations-client"
import { getTranslations } from "next-intl/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { UserWithOrganization, SerializedLocationWithConnection } from "@/lib/prisma-types"
import type { PaginationMeta } from "@/lib/api-types"

interface UserLocationsServerProps {
  user: UserWithOrganization
  searchParams: Promise<{ page?: string }>
}

/**
 * UserLocationsServer - Server Component
 * 
 * Fetches paginated locations data and passes it to Client Component.
 */
export async function UserLocationsServer({ 
  user, 
  searchParams 
}: UserLocationsServerProps) {
  const t = await getTranslations("backoffice.users.detail.locations")
  const params = await searchParams
  
  const organizationId = user.organization_id
  
  // Early return if no organization
  if (!organizationId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("noOrganization")}
          </p>
        </CardContent>
      </Card>
    )
  }

  const pageParam = params.page
  const page = pageParam && !isNaN(Number(pageParam))
    ? Math.max(1, Number(pageParam))
    : 1

  // Fetch locations from server
  const result = await getPaginatedLocations({
    page,
    limit: 20,
    createdBy: user.id, // Filter by user who created the location
    sortBy: "created_at",
    sortOrder: "desc",
  })

  const locations: SerializedLocationWithConnection[] = (result.locations || []).sort((a, b) => {
    const aActive = a.status === "active" ? 1 : 0
    const bActive = b.status === "active" ? 1 : 0
    if (aActive !== bActive) {
      return bActive - aActive
    }
    return 0
  })
  
  // Build pagination metadata
  const pagination: PaginationMeta = {
    page: result.pagination.page,
    limit: result.pagination.limit,
    total: result.pagination.total,
    totalPages: result.pagination.totalPages,
    hasNext: result.pagination.hasNext,
    hasPrev: result.pagination.hasPrev,
  }

  return (
    <UserLocationsClient 
      locations={locations}
      pagination={pagination}
      user={user}
    />
  )
}

