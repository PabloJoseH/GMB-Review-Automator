/**
 * @fileoverview Reviews server actions for Supabase.
 *
 * @remarks
 * Provides sample review and test review helpers with pagination and lookup utilities.
 *
 * Key exports:
 * - `createManyReviews`
 * - `findReviewsByLocationId`
 * - `getExampleReviewsByLocationIdPaginated`
 * - `createManyTestReviews`
 * - `getAllTestReviewsPaginated`
 *
 * Relevant types:
 * - `ReviewsQueryParams`
 * - `PaginatedExampleReviewsResponse`
 * - `PaginatedTestReviewsResponse`
 */
'use server'

import { ReviewsModel, type ExampleReviewToSave, type TestReviewToSave, type ReviewToSave } from '../../models/supabase/reviews.model'
import type { example_reviews, reviews_responses_test } from '../../../app/generated/prisma'
import { createLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedOrganizationAccess, requireServerActionUser } from '@/lib/server-action-auth'
import { checkIfStaff } from '@/lib/auth-helpers'

const logger = createLogger('REVIEWS')

async function getOrganizationAccessForAdmin() {
  const { clerkUserId } = await requireServerActionUser()
  const isStaff = await checkIfStaff(clerkUserId)

  if (isStaff) {
    return { isStaff }
  }

  const { organizationId } = await getAuthenticatedOrganizationAccess()
  return { isStaff, organizationId }
}

async function hasLocationOrganizationAccess(locationId: string, organizationId: string): Promise<boolean> {
  const location = await prisma.locations.findFirst({
    where: {
      id: locationId,
      connections: {
        organization_id: organizationId
      }
    },
    select: { id: true }
  })

  return !!location
}

async function hasLocationsOrganizationAccess(locationIds: string[], organizationId: string): Promise<boolean> {
  if (!locationIds.length) {
    return false
  }

  const locations = await prisma.locations.findMany({
    where: {
      id: { in: locationIds },
      connections: { organization_id: organizationId }
    },
    select: { id: true }
  })

  return locations.length === new Set(locationIds).size
}

/**
 * Overview: Reviews Server Actions for Supabase
 * 
 * IMPORTANT: This file manages THREE types of reviews:
 * 
 * 1. **EXAMPLE_REVIEWS**: Sample reviews linked to locations
 *    - Functions: findReviewsByLocationId, createManyReviews, etc.
 *    - Used in: Location detail pages (/backoffice/locations/[id])
 * 
 * 2. **REVIEWS_RESPONSES_TEST**: Test reviews for AI configuration testing
 *    - Functions: getAllTestReviewsPaginated, createManyTestReviews, etc.
 *    - Used in: Test reviews list page (/backoffice/reviews)
 * 
 * 3. **PROPOSED_RESPONSES**: Proposed responses pending approval
 *    - (Not managed here currently)
 * 
 * Architecture: Action → Model → DB
 */

export interface ReviewsQueryParams {
  page: number
  limit: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  locationIds?: string[]
  authorNames?: string[]
  reviewTimes?: Date[]
}

export interface PaginatedExampleReviewsResponse {
  reviews: example_reviews[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export interface PaginatedTestReviewsResponse {
  reviews: reviews_responses_test[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

// ============================================================================
// EXAMPLE_REVIEWS - Sample reviews linked to locations
// Used in: Location detail pages (/backoffice/locations/[id])
// ============================================================================

/**
 * Create many sample reviews
 */
export async function createManyReviews(reviewsToCreate: ExampleReviewToSave[]) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const locationIds = reviewsToCreate.map(review => review.location_id)
    const hasAccess = isStaff || await hasLocationsOrganizationAccess(locationIds, organizationId)
    if (!hasAccess) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.info('Creating many sample reviews', { reviewsToCreate: reviewsToCreate.length })

    const reviews = await ReviewsModel.createManyReviews(reviewsToCreate)

    logger.success('Sample reviews created', { reviews: reviewsToCreate.length })

    return {
      success: true,
      data: reviews,
      message: 'Reviews created'
    }
  } catch (error) {
    logger.error('Error creating many sample reviews', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Error creating many reviews'
    }
  }
}

/**
 * Find existing sample reviews
 */
export async function findExistingReviews(locationIds: string[], authorNames: string[], reviewTimes: Date[]) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const hasAccess = isStaff || await hasLocationsOrganizationAccess(locationIds, organizationId)
    if (!hasAccess) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.info('Finding existing sample reviews', { locationIds: locationIds.length, authorNames: authorNames.length, reviewTimes: reviewTimes.length })

    const reviews = await ReviewsModel.findExistingReviews(locationIds, authorNames, reviewTimes)

    if (!reviews) {
      return {
        success: false,
        error: 'No reviews found',
        message: 'No reviews found'
      }
    }

    logger.success('Sample reviews found', { reviews: reviews.length })

    return {
      success: true,
      data: reviews,
      message: 'Reviews found'
    }
  } catch (error) {
    logger.error('Error finding existing sample reviews', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Error finding existing reviews'
    }
  }
}

/**
 * Find sample reviews by filter
 */
export async function findReviewsByFilter(locationIds: string[], authorNames: string[], reviewTimes: Date[]) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const hasAccess = isStaff || await hasLocationsOrganizationAccess(locationIds, organizationId)
    if (!hasAccess) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.info('Finding sample reviews by filter', { locationIds: locationIds.length, authorNames: authorNames.length, reviewTimes: reviewTimes.length })

    const reviews = await ReviewsModel.findReviewsByFilter(locationIds, authorNames, reviewTimes)

    if (!reviews) {
      return {
        success: false,
        error: 'No reviews found',
        message: 'No reviews found'
      }
    }

    logger.success('Sample reviews found', { reviews: reviews.length })

    return {
      success: true,
      data: reviews,
      message: 'Reviews found'
    }
  } catch (error) {
    logger.error('Error finding sample reviews by filter', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Error finding reviews by filter'
    }
  }
}

/**
 * Find sample reviews by location ID
 */
export async function findReviewsByLocationId(locationId: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const hasAccess = isStaff || await hasLocationOrganizationAccess(locationId, organizationId)
    if (!hasAccess) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.info('Finding sample reviews by location ID', { locationId })

    const reviews = await ReviewsModel.findByLocationId(locationId)

    if (!reviews) {
      return {
        success: false,
        error: 'No reviews found',
        message: 'No reviews found'
      }
    }

    logger.success('Sample reviews found', { reviews: reviews.length })

    return {
      success: true,
      data: reviews,
      message: 'Reviews found'
    }
  } catch (error) {
    logger.error('Error finding sample reviews by location ID', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Error finding reviews by location ID'
    }
  }
}

/**
 * Get paginated example reviews by location ID
 * Used in: /backoffice/locations/[id] - prompt context tab
 */
export async function getExampleReviewsByLocationIdPaginated(
  locationId: string,
  page: number = 1,
  limit: number = 20,
  search?: string
): Promise<{ success: boolean; data?: PaginatedExampleReviewsResponse; error?: string }> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const hasAccess = isStaff || await hasLocationOrganizationAccess(locationId, organizationId)
    if (!hasAccess) {
      return {
        success: false,
        error: 'Unauthorized',
      }
    }

    logger.info('Getting paginated example reviews by location ID', { locationId, page, limit, search })

    const { reviews, total } = await ReviewsModel.findByLocationIdPaginated(locationId, page, limit, search)

    const totalPages = Math.ceil(total / limit)

    const paginatedResponse: PaginatedExampleReviewsResponse = {
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }

    logger.success('Example reviews retrieved', { count: reviews.length, total })

    return {
      success: true,
      data: paginatedResponse
    }
  } catch (error) {
    logger.error('Error getting paginated example reviews by location ID', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Find sample reviews by user ID
 */
export async function findReviewsByUserId(userId: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const user = await prisma.users.findFirst({
      where: isStaff ? { id: userId } : { id: userId, organization_id: organizationId },
      select: { id: true }
    })

    if (!user) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.info('Finding sample reviews by user ID', { userId })

    const reviews = await ReviewsModel.findByUserId(userId)

    if (!reviews) {
      return {
        success: false,
        error: 'No reviews found',
        message: 'No reviews found'
      }
    }

    logger.success('Sample reviews found', { reviews: reviews.length })

    return {
      success: true,
      data: reviews,
      message: 'Reviews found'
    }
  } catch (error) {
    logger.error('Error finding sample reviews by user ID', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Error finding reviews by user ID'
    }
  }
}

// ============================================================================
// REVIEWS_RESPONSES_TEST - Test reviews for AI configuration testing
// Used in: Test reviews list page (/backoffice/reviews)
// ============================================================================

/**
 * Create many test reviews
 */
export async function createManyTestReviews(reviewsToCreate: TestReviewToSave[]) {
  try {
    await getOrganizationAccessForAdmin()

    logger.info('Creating many test reviews', { reviewsToCreate: reviewsToCreate.length })

    const reviews = await ReviewsModel.createManyTestReviews(reviewsToCreate)

    logger.success('Test reviews created', { reviews: reviewsToCreate.length })

    return {
      success: true,
      data: reviews,
      message: 'Test reviews created'
    }
  } catch (error) {
    logger.error('Error creating many test reviews', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Error creating many test reviews'
    }
  }
}

/**
 * Get all test reviews with pagination
 * Used in: /backoffice/reviews
 */
export async function getAllTestReviewsPaginated(
  page: number = 1,
  limit: number = 20,
  search?: string
): Promise<{ success: boolean; data?: PaginatedTestReviewsResponse; error?: string }> {
  try {
    await getOrganizationAccessForAdmin()

    logger.info('Getting all test reviews paginated', { page, limit, search })

    const { reviews, total } = await ReviewsModel.findAllTestReviewsPaginated(page, limit, search)

    const totalPages = Math.ceil(total / limit)

    const paginatedResponse: PaginatedTestReviewsResponse = {
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }

    logger.success('Test reviews retrieved', { count: reviews.length, total })

    return {
      success: true,
      data: paginatedResponse
    }
  } catch (error) {
    logger.error('Error getting all test reviews paginated', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Legacy alias for getAllTestReviewsPaginated (for backwards compatibility)
 * @deprecated Use getAllTestReviewsPaginated instead
 */
export async function getAllReviewsPaginated(
  page: number = 1,
  limit: number = 20,
  search?: string
): Promise<{ success: boolean; data?: PaginatedTestReviewsResponse; error?: string }> {
  return getAllTestReviewsPaginated(page, limit, search)
}
