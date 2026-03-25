import { getPaginatedPubSubLogs } from "@/server/actions/supabase/pub-sub-log.action"
import { SystemLogsTableClient } from "./SystemLogsTableClient"
import type { PaginationMeta } from "@/lib/api-types"

interface SystemLogsTableServerProps {
  searchParams: Promise<{
    page?: string
  }>
}

// Server Component: resolves search params, fetches data, renders client table
export default async function SystemLogsTableServer({ searchParams }: SystemLogsTableServerProps) {
  const params = await searchParams

  const page = Math.max(1, Number(params.page) || 1)
  const limit = 20

  const res = await getPaginatedPubSubLogs(page, limit)
  const logs = res.data || []

  const totalPages = Math.ceil((res.pagination?.total || 0) / (res.pagination?.limit || 0))
  const hasNext = page < totalPages
  const hasPrev = page > 1

  const pagination: PaginationMeta = {
    page: res.pagination?.page || 0,
    limit: res.pagination?.limit || 0,
    total: res.pagination?.total || 0,
    totalPages,
    hasNext,
    hasPrev,
  }

  return (
    <SystemLogsTableClient 
      logs={logs}
      pagination={pagination}
    />
  )
}
