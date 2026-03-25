import { getExampleReviewsByLocationIdPaginated } from "@/server/actions/supabase/reviews.action"
import { ExampleReviewsTableClient } from "./example-reviews-table-client"
import type { PaginationMeta } from "@/lib/api-types"
import type { example_reviews } from "@/app/generated/prisma"

interface ExampleReviewsTableServerProps {
  locationId: string
  searchParams: Promise<{ page?: string }>
}

/**
 * ExampleReviewsTableServer - Server Component
 * 
 * Fetches paginated example reviews data and passes it to Client Component.
 */
export async function ExampleReviewsTableServer({ 
  locationId,
  searchParams 
}: ExampleReviewsTableServerProps) {
  const params = await searchParams
  
  const pageParam = params.page
  const page = pageParam && !isNaN(Number(pageParam))
    ? Math.max(1, Number(pageParam))
    : 1

  const result = await getExampleReviewsByLocationIdPaginated(locationId, page, 20)

  const reviews: example_reviews[] = result.success && result.data 
    ? result.data.reviews 
    : []

  const pagination: PaginationMeta = result.success && result.data
    ? {
        page: result.data.pagination.page,
        limit: result.data.pagination.limit,
        total: result.data.pagination.total,
        totalPages: result.data.pagination.totalPages,
        hasNext: result.data.pagination.hasNext,
        hasPrev: result.data.pagination.hasPrev,
      }
    : {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      }

  return (
    <ExampleReviewsTableClient 
      reviews={reviews}
      pagination={pagination}
    />
  )
}

