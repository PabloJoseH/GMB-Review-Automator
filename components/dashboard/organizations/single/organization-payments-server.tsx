import { getPaginatedPayments } from "@/server/actions/supabase/payments.action"
import { OrganizationPaymentsClient } from "./organization-payments-client"
import { getTranslations } from "next-intl/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { OrganizationWithRelations } from "@/lib/prisma-types"
import type { PaginationMeta } from "@/lib/api-types"

interface OrganizationPaymentsServerProps {
  organization: OrganizationWithRelations
  searchParams: Promise<{ page?: string }>
}

/**
 * OrganizationPaymentsServer - Server Component
 * 
 * Fetches paginated payments data and passes it to Client Component.
 */
export async function OrganizationPaymentsServer({ 
  organization, 
  searchParams 
}: OrganizationPaymentsServerProps) {
  const t = await getTranslations("backoffice.organizations.detail.payments")
  const params = await searchParams
  
  const organizationId = organization.id

  const pageParam = params.page
  const page = pageParam && !isNaN(Number(pageParam))
    ? Math.max(1, Number(pageParam))
    : 1

  // Fetch payments from server (sorted by most recent first)
  const result = await getPaginatedPayments({
    page,
    limit: 20,
    organizationId,
    sortBy: "created_at",
    sortOrder: "desc",
  })

  const paymentsData = result.payments || []
  
  const serializedPayments = paymentsData.map(payment => ({
    ...payment,
    amount: typeof payment.amount === 'object' && payment.amount !== null && 'toNumber' in payment.amount
      ? (payment.amount as { toNumber: () => number }).toNumber()
      : Number(payment.amount)
  }))
  
  const pagination: PaginationMeta = {
    page: result.pagination.page,
    limit: result.pagination.limit,
    total: result.pagination.total,
    totalPages: result.pagination.totalPages,
    hasNext: result.pagination.hasNext,
    hasPrev: result.pagination.hasPrev,
  }

  return (
    <OrganizationPaymentsClient 
      payments={serializedPayments}
      pagination={pagination}
      organization={organization}
    />
  )
}

