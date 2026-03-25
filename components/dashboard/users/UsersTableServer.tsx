import { getDashboardUsersTableData } from "@/server/actions/supabase/users.action"
import { UsersTableClient } from "@/components/dashboard/users/UsersTableClient"
import type { onboarding_status } from "@/app/generated/prisma"
import type { PaginationMeta } from "@/lib/api-types"
import type { UserWithLocationsCount } from "@/lib/prisma-types"

interface UsersTableServerProps {
  searchParams: Promise<{
    page?: string
    search?: string
    status?: string
    sortBy?: string
    sortOrder?: string
  }>
}

// Server Component: resolves search params, fetches data, renders client table
export default async function UsersTableServer({ searchParams }: UsersTableServerProps) {
  const params = await searchParams

  const page = Math.max(1, Number(params.page) || 1)
  const search = params.search?.trim() || undefined
  const statusFilter = params.status
  const sortBy = params.sortBy || "reference"
  const sortOrder = params.sortOrder === "asc" ? "asc" : "desc"

  // Handle status filter
  let onboardingStatus: onboarding_status | undefined
  let filterInProgress = false
  
  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "inProgress") {
      // Special filter: users where onboarding_status != 'done'
      filterInProgress = true
    } else {
      // Direct DB value filter
      onboardingStatus = statusFilter as onboarding_status
    }
  }

  const result = await getDashboardUsersTableData({
    page,
    limit: 20,
    sortBy,
    sortOrder,
    search,
    onboarding_status: onboardingStatus,
    filterInProgress,
  })

  const users: UserWithLocationsCount[] = result.success && result.data 
    ? result.data.users 
    : []

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
    <UsersTableClient 
      users={users}
      pagination={pagination}
      currentStatus={statusFilter || undefined}
      currentSearch={search || ""}
    />
  )
}


