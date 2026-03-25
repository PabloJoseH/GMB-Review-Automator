import { getPaginatedConnections } from "@/server/actions/supabase/connections.action"
import type { ConnectionWithLocationCount } from "@/server/actions/supabase/connections.action"
import { UserConnectionsClient } from "./user-connections-client"
import { getTranslations } from "next-intl/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { UserWithOrganization } from "@/lib/prisma-types"
import type { PaginationMeta } from "@/lib/api-types"
import type { locations } from "@/app/generated/prisma"

interface UserConnectionsServerProps {
  user: UserWithOrganization
  searchParams: Promise<{ page?: string }>
}

/**
 * UserConnectionsServer - Server Component
 * 
 * Fetches paginated connections data and passes it to Client Component.
 */
export async function UserConnectionsServer({ 
  user, 
  searchParams 
}: UserConnectionsServerProps) {
  const t = await getTranslations("backoffice.users.detail.connections")
  const params = await searchParams
  
  const organizationId = user.organization_id
  
  // Early return if no organization
  if (!organizationId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {t("noOrganization")}
          </CardDescription>
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

  // Fetch connections from server
  const result = await getPaginatedConnections({
    page,
    limit: 20,
    userId: user.id,
    sortBy: "created_at",
    sortOrder: "desc",
  })

  const connections: ConnectionWithLocationCount[] = result.connections || []
  
  //  Serialize connections: only include id, name, status for locations
  const serializedConnections: ConnectionWithLocationCount[] = connections
    .map(connection => ({
      ...connection,
      locations: connection.locations?.map((location: unknown) => {
        const loc = location as { id: string; name: string | null; status: string | null }
        return {
          id: loc.id,
          name: loc.name,
          status: (loc.status as locations['status']) || 'inactive',
        }
      })
    }))
    .sort((a, b) => {
      const aActive = a.pub_sub ? 1 : 0
      const bActive = b.pub_sub ? 1 : 0
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
    <UserConnectionsClient 
      connections={serializedConnections}
      pagination={pagination}
      user={user}
    />
  )
}

