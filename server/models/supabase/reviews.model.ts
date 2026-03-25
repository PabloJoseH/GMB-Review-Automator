/**
 * Reviews Model - Supabase Database Operations
 * 
 * Handles ALL database operations related to reviews.
 * 
 * IMPORTANT: There are THREE types of reviews in the system:
 * 
 * 1. **example_reviews**: Sample reviews linked to locations
 *    - Have location_id (FK to locations)
 *    - Used to display sample reviews in location detail pages
 *    - Fields: location_id, author_name, rating, comment, response, review_time
 * 
 * 2. **reviews_responses_test**: Test reviews for AI configuration testing
 *    - NO location_id (not linked to locations)
 *    - Used to test AI configurations without publishing to GMB
 *    - Additional fields: instructions, prompt_context_tone, prompt_context_handle_one_star, prompt_context_instructions
 *    - List page: /backoffice/reviews
 * 
 * 3. **proposed_responses**: Proposed responses pending approval
 *    - Have location_id (FK to locations)
 *    - Used to manage pending responses before publishing
 *    - (Not managed in this model currently)
 * 
 * Core functionalities:
 * - Batch operations for creating multiple reviews
 * - Search for existing reviews by composite criteria
 * - Optimized sync with change detection
 * - Transactions for data consistency
 */

import { prisma } from '../../../lib/prisma'
import type { example_reviews, reviews_responses_test, Prisma } from '../../../app/generated/prisma'
import { APP_CONSTANTS } from '@/lib/constants'

// ============================================================================
// TYPES FOR EXAMPLE_REVIEWS (Sample reviews linked to locations)
// ============================================================================
export type ExampleReviewToSave = Omit<example_reviews, 'id' | 'created_at' | 'updated_at'>

// ============================================================================
// TYPES FOR REVIEWS_RESPONSES_TEST (Test reviews for AI testing)
// ============================================================================
export type TestReviewToSave = Omit<reviews_responses_test, 'id' | 'created_at' | 'updated_at'>

// Legacy alias for compatibility (originally used for example_reviews, keeping for backwards compat)
export type ReviewToSave = ExampleReviewToSave

export const ReviewsModel = {
  // ============================================================================
  // EXAMPLE_REVIEWS - Sample reviews linked to locations
  // Used in: Location detail pages (/backoffice/locations/[id])
  // ============================================================================

  /**
   * Creates multiple sample reviews in batch using createMany
   * @param reviewsToCreate - Array of sample reviews to create
   * @returns Result of the createMany operation
   */
  createManyReviews: async (reviewsToCreate: ExampleReviewToSave[]) => {
    return await prisma.example_reviews.createMany({
      data: reviewsToCreate,
      skipDuplicates: true
    })
  },

  /**
   * Finds existing sample reviews based on composite criteria
   * @param locationIds - Array of location IDs
   * @param authorNames - Array of author names
   * @param reviewTimes - Array of review dates
   * @returns Array of existing sample reviews matching the criteria
   */
  findExistingReviews: async (
    locationIds: string[],
    authorNames: string[],
    reviewTimes: Date[]
  ): Promise<example_reviews[]> => {
    return await prisma.example_reviews.findMany({
      where: {
        location_id: { in: locationIds },
        author_name: { in: authorNames },
        review_time: { in: reviewTimes }
      }
    })
  },

  /**
   * Finds sample reviews by specific filters
   * @param locationIds - Array of location IDs
   * @param authorNames - Array of author names
   * @param reviewTimes - Array of review dates
   * @returns Array of filtered sample reviews
   */
  findReviewsByFilter: async (
    locationIds: string[],
    authorNames: string[],
    reviewTimes: Date[]
  ): Promise<example_reviews[]> => {
    return await prisma.example_reviews.findMany({
      where: {
        location_id: { in: locationIds },
        author_name: { in: authorNames },
        review_time: { in: reviewTimes }
      },
      orderBy: {
        review_time: 'desc'
      }
    })
  },

  /**
   * Finds sample reviews by location ID
   * @param locationId - Location ID
   * @returns Array of sample reviews for the specified location
   */
  findByLocationId: async (locationId: string): Promise<example_reviews[]> => {
    return await prisma.example_reviews.findMany({
      where: { location_id: locationId },
      orderBy: {
        review_time: 'desc'
      }
    })
  },

  /**
   * Finds sample reviews by location ID with pagination
   * @param locationId - Location ID
   * @param page - Page number
   * @param limit - Items per page
   * @param search - Optional search term
   * @returns Paginated sample reviews for the specified location
   */
  findByLocationIdPaginated: async (locationId: string, page: number = APP_CONSTANTS.database.query.defaultPage, limit: number = APP_CONSTANTS.database.pagination.defaultPageSize, search?: string) => {
    const skip = (page - 1) * limit
    
    const where: Prisma.example_reviewsWhereInput = {
      location_id: locationId,
      ...(search ? {
        OR: [
          { author_name: { contains: search, mode: 'insensitive' } },
          { comment: { contains: search, mode: 'insensitive' } },
          { response: { contains: search, mode: 'insensitive' } }
        ]
      } : {})
    }

    const [reviews, total] = await Promise.all([
      prisma.example_reviews.findMany({
        where,
        orderBy: {
          review_time: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.example_reviews.count({ where })
    ])

    return { reviews, total }
  },

  /**
   * Finds sample reviews by user ID (through locations)
   * @param userId - Owner user ID
   * @returns Array of user's sample reviews
   */
  findByUserId: async (userId: string): Promise<example_reviews[]> => {
    return await prisma.example_reviews.findMany({
      where: {
        locations: {
          created_by: userId
        }
      },
      orderBy: {
        review_time: 'desc'
      }
    })
  },

  // ============================================================================
  // REVIEWS_RESPONSES_TEST - Test reviews for AI configuration testing
  // Used in: Test reviews list page (/backoffice/reviews)
  // ============================================================================

  /**
   * Creates multiple test reviews in batch using createMany
   * @param reviewsToCreate - Array of test reviews to create
   * @returns Result of the createMany operation
   */
  createManyTestReviews: async (reviewsToCreate: TestReviewToSave[]) => {
    return await prisma.reviews_responses_test.createMany({
      data: reviewsToCreate,
      skipDuplicates: true
    })
  },

  /**
   * Finds existing test reviews by reviewer_name and create_time
   * @param reviewerNames - Array of reviewer names
   * @param reviewTimes - Array of review dates
   * @returns Array of existing test reviews
   */
  findExistingTestReviews: async (
    reviewerNames: string[],
    reviewTimes: Date[]
  ): Promise<reviews_responses_test[]> => {
    return await prisma.reviews_responses_test.findMany({
      where: {
        reviewer_name: { in: reviewerNames },
        create_time: { in: reviewTimes }
      }
    })
  },

  /**
   * Finds test reviews by specific filters
   * @param reviewerNames - Array of reviewer names
   * @param reviewTimes - Array of review dates
   * @returns Array of filtered test reviews
   */
  findTestReviewsByFilter: async (
    reviewerNames: string[],
    reviewTimes: Date[]
  ): Promise<reviews_responses_test[]> => {
    return await prisma.reviews_responses_test.findMany({
      where: {
        reviewer_name: { in: reviewerNames },
        create_time: { in: reviewTimes }
      },
      orderBy: {
        create_time: 'desc'
      }
    })
  },

  /**
   * Finds all test reviews with pagination
   * Used in: /backoffice/reviews
   * @param page - Page number
   * @param limit - Items per page
   * @param search - Optional search term
   * @returns Paginated test reviews
   */
  findAllTestReviewsPaginated: async (page: number = APP_CONSTANTS.database.query.defaultPage, limit: number = APP_CONSTANTS.database.pagination.defaultPageSize, search?: string) => {
    const skip = (page - 1) * limit
    
    const where: Prisma.reviews_responses_testWhereInput = search
      ? {
          OR: [
            { reviewer_name: { contains: search, mode: 'insensitive' } },
            { comment: { contains: search, mode: 'insensitive' } },
            { response: { contains: search, mode: 'insensitive' } }
          ]
        }
      : {}

    const [reviews, total] = await Promise.all([
      prisma.reviews_responses_test.findMany({
        where,
        include: {
          locations: {
            select: { id: true, name: true }
          }
        },
        orderBy: {
          create_time: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.reviews_responses_test.count({ where })
    ])

    return { reviews, total }
  },

  /**
   * Counts all test reviews
   * @returns Total count of test reviews
   */
  countAllTestReviews: async (): Promise<number> => {
    return await prisma.reviews_responses_test.count()
  },

  /**
   * Counts all sample reviews
   * @returns Total count of sample reviews
   */
  countAllExampleReviews: async (): Promise<number> => {
    return await prisma.example_reviews.count()
  },

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Execute transaction
   * @param transactionFunction - Function to execute in transaction
   * @returns Result of the transaction
   */
  executeTransaction: async <T>(transactionFunction: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
    return await prisma.$transaction(transactionFunction)
  }
}
