/**
 * @fileoverview Global configs server table renderer.
 *
 * @remarks
 * Resolves pagination params, fetches global config data, and renders
 * the client table with rows and pagination metadata.
 *
 * @exports GlobalConfigsTableServer
 */
import { getPaginatedGlobalConfigs } from "@/server/actions/supabase/global-config.action"
import { GlobalConfigsTableClient } from "./GlobalConfigsTableClient"
import { type GlobalConfigRow } from "./columns"
import type { global_config } from "@/app/generated/prisma"
import type { PaginationMeta } from "@/lib/api-types"

interface GlobalConfigsTableServerProps {
  searchParams: Promise<{
    page?: string
  }>
}

export default async function GlobalConfigsTableServer({ searchParams }: GlobalConfigsTableServerProps) {
  const params = await searchParams

  const page = Math.max(1, Number(params.page) || 1)
  const limit = 10

  const res = await getPaginatedGlobalConfigs(page, limit)
  const rows: GlobalConfigRow[] = (res.data || []).map((r: global_config) => ({
    id: r.id,
    active: r.active,
    created_at: r.created_at?.toISOString() ?? null,
    updated_at: r.updated_at?.toISOString() ?? null,
    responder_model: r.responder_model || null,
    onboarding_model: r.onboarding_model || null,
  }))

  const paginationData = res.pagination ?? { page, limit, total: 0 }
  const totalPages = Math.max(1, Math.ceil(paginationData.total / paginationData.limit))
  const hasNext = page < totalPages
  const hasPrev = page > 1

  const pagination: PaginationMeta = {
    page: paginationData.page,
    limit: paginationData.limit,
    total: paginationData.total,
    totalPages,
    hasNext,
    hasPrev,
  }

  return (
    <GlobalConfigsTableClient 
      rows={rows} 
      pagination={pagination} 
    />
  )
}


