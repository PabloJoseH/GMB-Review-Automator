/**
 * ReviewsTableServer - Server Component
 * 
 * Fetches reviews data server-side and renders the client table component.
 * Handles pagination, search, and sorting parameters from URL.
 */

import { getAllReviewsPaginated } from "@/server/actions/supabase/reviews.action"
import { ReviewsTableClient } from "./ReviewsTableClient"
import type { ReviewWithLocation } from "./columns"
import type { PaginationMeta } from "@/lib/api-types"

interface ReviewsTableServerProps {
  searchParams: Promise<{
    page?: string
    search?: string
    sortBy?: string
    sortOrder?: string
    commentStatus?: string
    rating?: string
  }>
}

export default async function ReviewsTableServer({ searchParams }: ReviewsTableServerProps) {
  const params = await searchParams

  const page = Math.max(1, Number(params.page) || 1)
  const search = params.search?.trim() || undefined
  const sortBy = params.sortBy || "reviewDate"
  const sortOrder = params.sortOrder === "asc" ? "asc" : "desc"
  const commentStatus = params.commentStatus
  const rating = params.rating

  const limit = 20

  const result = await getAllReviewsPaginated(page, limit, search)

  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{result.error || "Error loading reviews"}</p>
      </div>
    )
  }

  let reviews = result.data.reviews as unknown as ReviewWithLocation[]

  // Apply filters
  if (commentStatus) {
    if (commentStatus === "with") {
      reviews = reviews.filter(r => r.comment && r.comment.trim().length > 0)
    } else if (commentStatus === "without") {
      reviews = reviews.filter(r => !r.comment || r.comment.trim().length === 0)
    }
  }

  if (rating) {
    reviews = reviews.filter(r => r.rating === rating)
  }

  // Apply sorting
  reviews = [...reviews].sort((a, b) => {
    let aValue: Date | string | number | null | undefined
    let bValue: Date | string | number | null | undefined
    
    if (sortBy === 'reviewDate') {
      aValue = a.create_time
      bValue = b.create_time
    } else if (sortBy === 'location') {
      aValue = a.locations?.name
      bValue = b.locations?.name
    } else if (sortBy === 'author') {
      aValue = a.reviewer_name
      bValue = b.reviewer_name
    } else if (sortBy === 'rating') {
      aValue = a.rating
      bValue = b.rating
    } else {
      aValue = a[sortBy as keyof typeof a] as Date | string | number | null | undefined
      bValue = b[sortBy as keyof typeof b] as Date | string | number | null | undefined
    }
    
    if (!aValue) return 1
    if (!bValue) return -1
    
    if (aValue instanceof Date || bValue instanceof Date) {
      const aTime = aValue instanceof Date ? aValue.getTime() : new Date(aValue as string).getTime()
      const bTime = bValue instanceof Date ? bValue.getTime() : new Date(bValue as string).getTime()
      return sortOrder === 'asc' ? aTime - bTime : bTime - aTime
    }
    
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue
    }
    
    const aStr = String(aValue).toLowerCase()
    const bStr = String(bValue).toLowerCase()
    return sortOrder === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
  })

  const pagination: PaginationMeta = {
    page: result.data.pagination.page,
    limit: result.data.pagination.limit,
    total: result.data.pagination.total,
    totalPages: result.data.pagination.totalPages,
    hasNext: result.data.pagination.hasNext,
    hasPrev: result.data.pagination.hasPrev,
  }

  return (
    <ReviewsTableClient 
      reviews={reviews}
      pagination={pagination}
      currentSearch={search || ""}
      currentCommentStatus={commentStatus}
      currentRating={rating}
    />
  )
}

