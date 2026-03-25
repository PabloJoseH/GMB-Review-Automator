import { getPaginatedSessions } from "@/server/actions/supabase/sessions.action"
import type { SessionWithMessageCount } from "@/server/actions/supabase/sessions.action"
import { UserSessionsClient } from "./user-sessions-client"
import { getTranslations } from "next-intl/server"
import { MessageSquare } from "lucide-react"
import { createLogger } from "@/lib/logger"
import type { UserWithOrganization } from "@/lib/prisma-types"
import type { PaginationMeta } from "@/lib/api-types"

const logger = createLogger('USER_SESSIONS')

interface UserSessionsServerProps {
  user: UserWithOrganization
  searchParams: Promise<{ page?: string }>
}

/**
 * UserSessionsServer - Server Component
 * 
 * Fetches paginated sessions data and passes it to Client Component.
 */
export async function UserSessionsServer({ 
  user, 
  searchParams 
}: UserSessionsServerProps) {
  const t = await getTranslations("backoffice.users.detail.sessions")
  const params = await searchParams
  
  const pageParam = params.page
  const page = pageParam && !isNaN(Number(pageParam))
    ? Math.max(1, Number(pageParam))
    : 1

  // Fetch sessions from server
  const result = await getPaginatedSessions({
    userId: user.id,
    page,
    limit: 20,
    sortBy: "created_at",
    sortOrder: "desc",
  })

  // Handle errors
  if (!result.success) {
    // Log error with proper error object (result.error is a string)
    const errorObj = result.error 
      ? new Error(result.error) 
      : new Error('Unknown error occurred while fetching sessions')
    
    logger.error('Failed to fetch sessions', errorObj, { 
      userId: user.id,
      errorMessage: result.error || 'Unknown error'
    })
    
    return (
      <div className="space-y-4">
        <div className="px-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {t("title")}
          </h3>
        </div>
        <div className="flex items-center justify-center py-12 border rounded-md">
          <p className="text-sm text-destructive">
            {t("error") || "Error loading sessions"}
          </p>
        </div>
      </div>
    )
  }

  const sessions: SessionWithMessageCount[] = result.data?.sessions || []
  
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
    <UserSessionsClient 
      sessions={sessions}
      pagination={pagination}
      user={user}
    />
  )
}

