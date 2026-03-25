import { TabsContent } from "@/components/ui/tabs"
import { UserDetailTabs } from "@/components/dashboard/users/single/user-detail-tabs"
import { UserInfoSection } from "@/components/dashboard/users/single/user-info-section"
import { UserConnectionsServer } from "@/components/dashboard/users/single/user-connections-server"
import { UserLocationsServer } from "@/components/dashboard/users/single/user-locations-server"
import { UserSessionsServer } from "@/components/dashboard/users/single/user-sessions-server"
import { getUserById } from "@/server/actions/supabase/users.action"
import { createLogger } from "@/lib/logger"
import { notFound } from "next/navigation"
import type { UserWithOrganization } from "@/lib/prisma-types"

const logger = createLogger('USER_DETAIL_TABS')

function getValidTab(tabParam: string | undefined): "info" | "accounts" | "locations" | "sessions" {
  const validTabs = ["info", "accounts", "locations", "sessions"] as const
  return tabParam && validTabs.includes(tabParam as typeof validTabs[number])
    ? (tabParam as typeof validTabs[number])
    : "info"
}

function getValidPage(pageParam: string | undefined): number {
  if (!pageParam) return 1
  const page = Number(pageParam)
  return isNaN(page) || page < 1 ? 1 : page
}

interface UserDetailTabsServerProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    tab?: string
    page?: string
  }>
}

/**
 * Server component that fetches user data and renders tabbed content.
 * 
 * Validates URL parameters (tab, page), fetches user by ID, and renders
 * tabbed interface with user information, connections, locations, and sessions.
 * Uses React keys on paginated tabs to force re-render on page changes.
 * Must be wrapped in Suspense boundary.
 */
export async function UserDetailTabsServer({ 
  params, 
  searchParams 
}: UserDetailTabsServerProps) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const result = await getUserById(id)
  
  if (!result.success || !result.data) {
    logger.error('User not found', null, { userId: id })
    notFound()
  }
  
  const user = result.data
  const defaultTab = getValidTab(resolvedSearchParams.tab)
  
  const accountsPage = defaultTab === "accounts" 
    ? getValidPage(resolvedSearchParams.page).toString() 
    : undefined
  const locationsPage = defaultTab === "locations" 
    ? getValidPage(resolvedSearchParams.page).toString() 
    : undefined
  const sessionsPage = defaultTab === "sessions" 
    ? getValidPage(resolvedSearchParams.page).toString() 
    : undefined

  const accountsKey = accountsPage ? `accounts-${accountsPage}` : "accounts-1"
  const locationsKey = locationsPage ? `locations-${locationsPage}` : "locations-1"
  const sessionsKey = sessionsPage ? `sessions-${sessionsPage}` : "sessions-1"

  return (
    <UserDetailTabs defaultTab={defaultTab}>
      <TabsContent value="info" className="space-y-6 mt-6 pb-8">
        <UserInfoSection user={user} />
      </TabsContent>

      <TabsContent value="accounts" className="space-y-6 mt-6">
        <div key={defaultTab === "accounts" ? accountsKey : undefined}>
          <UserConnectionsServer 
            user={user}
            searchParams={searchParams}
          />
        </div>
      </TabsContent>

      <TabsContent value="locations" className="space-y-6 mt-6">
        <div key={defaultTab === "locations" ? locationsKey : undefined}>
          <UserLocationsServer 
            user={user}
            searchParams={searchParams}
          />
        </div>
      </TabsContent>

      <TabsContent value="sessions" className="space-y-6 mt-6">
        <div key={defaultTab === "sessions" ? sessionsKey : undefined}>
          <UserSessionsServer 
            user={user}
            searchParams={searchParams}
          />
        </div>
      </TabsContent>
    </UserDetailTabs>
  )
}

