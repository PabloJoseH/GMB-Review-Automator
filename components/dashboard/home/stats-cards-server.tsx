import { getDashboardStats } from "@/server/actions/supabase/pub-sub-log.action"
import { UserCountStat } from "./user-count-stat"
import { OrganizationCountStat } from "./organization-count-stat"
import { LocationCountStat } from "./location-count-stat"
import { ResponseCountStat } from "./response-count-stat"

/**
 * StatsCardsServer Component
 * 
 * Fetches dashboard statistics and renders stat cards.
 * Uses getDashboardStats() to fetch all stats in a single transaction.
 */
export async function StatsCardsServer() {
  const statsResult = await getDashboardStats()
  
  // Use stats from result or defaults
  const stats = statsResult.success && statsResult.data
    ? statsResult.data
    : {
        totalUsers: 0,
        totalOrganizations: 0,
        totalLocations: 0,
        totalResponses: 0
      }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <UserCountStat count={stats.totalUsers} />
      <OrganizationCountStat count={stats.totalOrganizations} />
      <LocationCountStat count={stats.totalLocations} />
      <ResponseCountStat count={stats.totalResponses} />
    </div>
  )
}

