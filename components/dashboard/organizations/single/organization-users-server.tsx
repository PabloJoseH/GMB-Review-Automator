import { getPaginatedUsers } from "@/server/actions/supabase/users.action"
import { OrganizationUsersClient } from "./organization-users-client"
import { getTranslations } from "next-intl/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { OrganizationWithRelations } from "@/lib/prisma-types"
import type { PaginationMeta } from "@/lib/api-types"

interface OrganizationUsersServerProps {
  organization: OrganizationWithRelations
  searchParams: Promise<{ page?: string }>
}

/**
 * OrganizationUsersServer - Server Component
 * 
 * Fetches paginated users data and passes it to Client Component.
 */
export async function OrganizationUsersServer({ 
  organization, 
  searchParams 
}: OrganizationUsersServerProps) {
  const t = await getTranslations("backoffice.organizations.detail.users")
  const params = await searchParams
  
  const pageParam = params.page
  const page = pageParam && !isNaN(Number(pageParam))
    ? Math.max(1, Number(pageParam))
    : 1

  // Fetch users from server using getPaginatedUsers directly
  const result = await getPaginatedUsers({
    page,
    limit: 20,
    organization_id: organization.id,
    sortBy: "created_at",
    sortOrder: "desc",
  })

  if (!result.success || !result.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {t("error")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {result.error || t("error")}
          </p>
        </CardContent>
      </Card>
    )
  }

  const users = result.data.users
  const pagination: PaginationMeta = {
    page: result.pagination.page,
    limit: result.pagination.limit,
    total: result.pagination.total,
    totalPages: result.pagination.totalPages,
    hasNext: result.pagination.hasNext,
    hasPrev: result.pagination.hasPrev,
  }

  return (
    <OrganizationUsersClient 
      users={users}
      pagination={pagination}
      organization={organization}
    />
  )
}

