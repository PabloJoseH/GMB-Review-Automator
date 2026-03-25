import { TabsContent } from "@/components/ui/tabs"
import { OrganizationDetailTabs } from "@/components/dashboard/organizations/single/organization-detail-tabs"
import { OrganizationInfoSection } from "@/components/dashboard/organizations/single/organization-info-section"
import { OrganizationUsersServer } from "@/components/dashboard/organizations/single/organization-users-server"
import { OrganizationLocationsServer } from "@/components/dashboard/organizations/single/organization-locations-server"
import { OrganizationPaymentsServer } from "@/components/dashboard/organizations/single/organization-payments-server"
import { getOrganizationByIdWithRelations } from "@/server/actions/supabase/organizations.action"
import { createLogger } from "@/lib/logger"
import { notFound } from "next/navigation"
import type { OrganizationWithRelations } from "@/lib/prisma-types"

const logger = createLogger('ORGANIZATION_DETAIL_TABS')

function getValidTab(tabParam: string | undefined): "info" | "users" | "locations" | "payments" {
  const validTabs = ["info", "users", "locations", "payments"] as const
  return tabParam && validTabs.includes(tabParam as typeof validTabs[number])
    ? (tabParam as typeof validTabs[number])
    : "info"
}

function getValidPage(pageParam: string | undefined): number {
  if (!pageParam) return 1
  const page = Number(pageParam)
  return isNaN(page) || page < 1 ? 1 : page
}

interface OrganizationDetailTabsServerProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    tab?: string
    page?: string
  }>
}

/**
 * Server component that fetches organization data and renders tabbed content.
 * 
 * Validates URL parameters (tab, page), fetches organization by ID, and renders
 * tabbed interface with organization information, users, locations, and payments.
 * Uses React keys on paginated tabs to force re-render on page changes.
 * Must be wrapped in Suspense boundary.
 */
export async function OrganizationDetailTabsServer({ 
  params, 
  searchParams 
}: OrganizationDetailTabsServerProps) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const result = await getOrganizationByIdWithRelations(id)
  
  if (!result.success || !result.data) {
    logger.error('Organization not found', null, { organizationId: id })
    notFound()
  }
  
  const organization = result.data as OrganizationWithRelations
  const defaultTab = getValidTab(resolvedSearchParams.tab)
  
  const usersPage = defaultTab === "users" 
    ? getValidPage(resolvedSearchParams.page).toString() 
    : undefined
  const locationsPage = defaultTab === "locations" 
    ? getValidPage(resolvedSearchParams.page).toString() 
    : undefined
  const paymentsPage = defaultTab === "payments" 
    ? getValidPage(resolvedSearchParams.page).toString() 
    : undefined

  const usersKey = usersPage ? `users-${usersPage}` : "users-1"
  const locationsKey = locationsPage ? `locations-${locationsPage}` : "locations-1"
  const paymentsKey = paymentsPage ? `payments-${paymentsPage}` : "payments-1"

  return (
    <OrganizationDetailTabs defaultTab={defaultTab}>
      <TabsContent value="info" className="space-y-6 mt-6 pb-8">
        <OrganizationInfoSection organization={organization} />
      </TabsContent>

      <TabsContent value="users" className="space-y-6 mt-6">
        <div key={defaultTab === "users" ? usersKey : undefined}>
          <OrganizationUsersServer 
            organization={organization}
            searchParams={searchParams}
          />
        </div>
      </TabsContent>

      <TabsContent value="locations" className="space-y-6 mt-6">
        <div key={defaultTab === "locations" ? locationsKey : undefined}>
          <OrganizationLocationsServer 
            organization={organization}
            searchParams={searchParams}
          />
        </div>
      </TabsContent>

      <TabsContent value="payments" className="space-y-6 mt-6">
        <div key={defaultTab === "payments" ? paymentsKey : undefined}>
          <OrganizationPaymentsServer 
            organization={organization}
            searchParams={searchParams}
          />
        </div>
      </TabsContent>
    </OrganizationDetailTabs>
  )
}

