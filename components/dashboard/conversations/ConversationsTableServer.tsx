import { getConversationsTableData } from "@/server/actions/supabase/sessions.action"
import { ConversationsTableClient } from "./ConversationsTableClient"
import type { SessionWithUser } from "./columns"
import { APP_CONSTANTS } from "@/lib/constants"

interface ConversationsTableServerProps {
  searchParams: Promise<{
    page?: string
    search?: string
    sortBy?: string
    sortOrder?: string
  }>
}

// Server Component: resolves search params, fetches data, renders client table
export default async function ConversationsTableServer({ searchParams }: ConversationsTableServerProps) {
  const params = await searchParams

  const page = Math.max(1, Number(params.page) || 1)
  const search = params.search?.trim() || undefined
  const sortBy = params.sortBy || "lastMessage"
  const sortOrder = params.sortOrder === "asc" ? "asc" : "desc"

  const result = await getConversationsTableData({
    page,
    limit: APP_CONSTANTS.database.pagination.defaultPageSize,
    sortBy,
    sortOrder
  })

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to load conversations data')
  }

  const { sessions: sessionsData, thresholdTokens } = result.data
  const pagination = result.pagination!

  const sessions: SessionWithUser[] = sessionsData

  return (
    <ConversationsTableClient 
      sessions={sessions}
      pagination={pagination}
      currentSearch={search || ""}
      thresholdTokens={thresholdTokens}
    />
  )
}

