/**
 * @fileoverview Proposed responses server actions for Supabase.
 *
 * @remarks
 * Manages proposed review responses with pagination, filtering, and validation helpers.
 *
 * Key exports:
 * - `createProposedResponse`
 * - `getPaginatedProposedResponses`
 * - `updateProposedResponse`
 * - `deleteProposedResponse`
 * - `sendProposedResponsesToGmb`
 *
 * Relevant types:
 * - `ProposedResponsesQueryParams`
 */
'use server'

import { ProposedResponsesModel, type ProposedResponseToCreate, type UserWithGroupedLocations } from '../../models/supabase/proposed-responses.model'
import { LocationsModel } from '../../models/supabase/locations.model'
import type { proposed_responses } from '../../../app/generated/prisma'
import { createLogger } from '@/lib/logger'
import type { Prisma } from '@/app/generated/prisma'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedOrganizationAccess, requireServerActionUser } from '@/lib/server-action-auth'
import { checkIfStaff } from '@/lib/auth-helpers'

const logger = createLogger('PROPOSED_RESPONSES')

async function getOrganizationAccessForAdmin() {
  const { clerkUserId } = await requireServerActionUser()
  const isStaff = await checkIfStaff(clerkUserId)

  if (isStaff) {
    return { isStaff }
  }

  const { organizationId } = await getAuthenticatedOrganizationAccess()
  return { isStaff, organizationId }
}

/**
 * Overview: Proposed Responses Server Actions for Supabase
 * - Handles proposed responses CRUD operations directly through model layer
 * - Provides pagination and search functionality
 * - Manages proposed response data with location and user relations
 * - Follows layered architecture: Action → Model → DB
 * - Implements defensive programming with validation and error handling
 */

/**
 * Standard API response structure
 */
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message: string
}

/**
 * Paginated response structure
 */
interface PaginatedResponse<T> {
  success: boolean
  data?: {
    responses: T[]
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
      hasNext: boolean
      hasPrev: boolean
    }
    uniqueLocations?: Array<{ id: string; name: string | null }>
  }
  error?: string
  message: string
}

/**
 * Proposed response with location relation
 */
type ProposedResponseWithLocationRelation = proposed_responses & {
  locations?: { id: string; name: string | null } | null
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

async function hasUserOrganizationAccess(userId: string, organizationId: string): Promise<boolean> {
  const user = await prisma.users.findFirst({
    where: {
      id: userId,
      organization_id: organizationId
    },
    select: { id: true }
  })

  return !!user
}

async function hasProposedResponseAccess(
  response: proposed_responses,
  organizationId: string
): Promise<boolean> {
  if (response.location_id) {
    return hasLocationOrganizationAccess(response.location_id, organizationId)
  }

  if (response.user_id) {
    return hasUserOrganizationAccess(response.user_id, organizationId)
  }

  return false
}

/**
 * Query parameters for filtering and pagination
 */
export interface ProposedResponsesQueryParams {
  page?: number
  limit?: number
  locationId?: string
  userId?: string
  rating?: string
  reviewerName?: string
  sortBy?: 'created_at' | 'updated_at' | 'create_time'
  sortOrder?: 'asc' | 'desc'
}

/**
 * Create a single proposed response
 * Implements defensive programming with input validation
 */
export async function createProposedResponse(
  data: ProposedResponseToCreate
): Promise<ApiResponse<proposed_responses>> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    // Defensive validation: Check required fields
    if (!data.rating) {
      logger.warn('Attempted to create proposed response without rating')
      return {
        success: false,
        error: 'Rating is required',
        message: 'Cannot create proposed response without rating'
      }
    }

    // Defensive validation: Validate UUIDs if provided
    if (data.location_id && !isValidUUID(data.location_id)) {
      logger.warn('Invalid location_id provided', { location_id: data.location_id })
      return {
        success: false,
        error: 'Invalid location_id format',
        message: 'Location ID must be a valid UUID'
      }
    }

    if (data.user_id && !isValidUUID(data.user_id)) {
      logger.warn('Invalid user_id provided', { user_id: data.user_id })
      return {
        success: false,
        error: 'Invalid user_id format',
        message: 'User ID must be a valid UUID'
      }
    }

    if (data.location_id) {
      const allowed = isStaff || await hasLocationOrganizationAccess(data.location_id, organizationId)
      if (!allowed) {
        return {
          success: false,
          error: 'Unauthorized',
          message: 'Unauthorized organization access'
        }
      }
    }

    if (data.user_id) {
      const allowed = isStaff || await hasUserOrganizationAccess(data.user_id, organizationId)
      if (!allowed) {
        return {
          success: false,
          error: 'Unauthorized',
          message: 'Unauthorized organization access'
        }
      }
    }

    logger.debug('Creating proposed response', {
      location_id: data.location_id,
      user_id: data.user_id,
      rating: data.rating
    })

    const response = await ProposedResponsesModel.create(data)

    logger.info('Proposed response created successfully', {
      responseId: response.id,
      location_id: response.location_id,
      rating: response.rating
    })

    return {
      success: true,
      data: response,
      message: 'Proposed response created successfully'
    }
  } catch (error) {
    logger.error('Error creating proposed response', error)

    // Defensive error handling: Check for unique constraint violations
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return {
        success: false,
        error: 'Duplicate entry',
        message: 'A proposed response with these criteria already exists'
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to create proposed response'
    }
  }
}

/**
 * Create multiple proposed responses
 * Implements defensive programming with batch validation
 */
export async function createManyProposedResponses(
  data: ProposedResponseToCreate[]
): Promise<ApiResponse<{ count: number }>> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    // Defensive validation: Check if array is empty
    if (!data || data.length === 0) {
      logger.warn('Attempted to create proposed responses with empty array')
      return {
        success: false,
        error: 'Empty array provided',
        message: 'Cannot create proposed responses from empty array'
      }
    }

    // Defensive validation: Check array size limit
    if (data.length > 1000) {
      logger.warn('Attempted to create too many proposed responses', { count: data.length })
      return {
        success: false,
        error: 'Batch size too large',
        message: 'Cannot create more than 1000 proposed responses at once'
      }
    }

    // Defensive validation: Validate each item
    for (const item of data) {
      if (!item.rating) {
        logger.warn('Found proposed response without rating in batch')
        return {
          success: false,
          error: 'Rating is required for all items',
          message: 'All proposed responses must have a rating'
        }
      }
    }

    if (!isStaff) {
      const locationIds = data
        .map(item => item.location_id)
        .filter((id): id is string => !!id)
      if (locationIds.length) {
        const allowedLocations = await prisma.locations.findMany({
          where: {
            id: { in: locationIds },
            connections: { organization_id: organizationId }
          },
          select: { id: true }
        })
        if (allowedLocations.length !== new Set(locationIds).size) {
          return {
            success: false,
            error: 'Unauthorized',
            message: 'Unauthorized organization access'
          }
        }
      }

      const userIds = data
        .map(item => item.user_id)
        .filter((id): id is string => !!id)
      if (userIds.length) {
        const allowedUsers = await prisma.users.findMany({
          where: {
            id: { in: userIds },
            organization_id: organizationId
          },
          select: { id: true }
        })
        if (allowedUsers.length !== new Set(userIds).size) {
          return {
            success: false,
            error: 'Unauthorized',
            message: 'Unauthorized organization access'
          }
        }
      }
    }

    logger.debug('Creating multiple proposed responses', { count: data.length })

    const result = await ProposedResponsesModel.createMany(data)

    logger.info('Multiple proposed responses created successfully', {
      count: result.count,
      totalRequested: data.length
    })

    return {
      success: true,
      data: { count: result.count },
      message: `Successfully created ${result.count} proposed responses`
    }
  } catch (error) {
    logger.error('Error creating multiple proposed responses', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to create proposed responses'
    }
  }
}

/**
 * Get proposed response by ID
 * Implements defensive programming with existence check
 */
export async function getProposedResponseById(
  id: string
): Promise<ApiResponse<proposed_responses>> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    // Defensive validation: Check if ID is provided
    if (!id) {
      logger.warn('Attempted to get proposed response without ID')
      return {
        success: false,
        error: 'ID is required',
        message: 'Cannot retrieve proposed response without ID'
      }
    }

    // Defensive validation: Validate UUID format
    if (!isValidUUID(id)) {
      logger.warn('Invalid ID format provided', { id })
      return {
        success: false,
        error: 'Invalid ID format',
        message: 'ID must be a valid UUID'
      }
    }

    logger.debug('Getting proposed response by ID', { id })

    const response = await ProposedResponsesModel.findById(id)

    if (!response) {
      logger.warn('Proposed response not found', { id })
      return {
        success: false,
        error: 'Proposed response not found',
        message: 'No proposed response found with the provided ID'
      }
    }

    const allowed = isStaff || await hasProposedResponseAccess(response, organizationId)
    if (!allowed) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.info('Proposed response retrieved successfully', {
      responseId: response.id,
      location_id: response.location_id
    })

    return {
      success: true,
      data: response,
      message: 'Proposed response retrieved successfully'
    }
  } catch (error) {
    logger.error('Error getting proposed response by ID', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve proposed response'
    }
  }
}

/**
 * Get proposed responses by location ID
 * Implements defensive programming with validation
 */
export async function getProposedResponsesByLocationId(
  locationId: string,
  params?: {
    sortBy?: 'created_at' | 'updated_at' | 'create_time'
    sortOrder?: 'asc' | 'desc'
  }
): Promise<ApiResponse<proposed_responses[]>> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    // Defensive validation: Check if locationId is provided
    if (!locationId) {
      logger.warn('Attempted to get proposed responses without location ID')
      return {
        success: false,
        error: 'Location ID is required',
        message: 'Cannot retrieve proposed responses without location ID'
      }
    }

    // Defensive validation: Validate UUID format
    if (!isValidUUID(locationId)) {
      logger.warn('Invalid location ID format', { locationId })
      return {
        success: false,
        error: 'Invalid location ID format',
        message: 'Location ID must be a valid UUID'
      }
    }

    const allowed = isStaff || await hasLocationOrganizationAccess(locationId, organizationId)
    if (!allowed) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Getting proposed responses by location ID', {
      locationId,
      sortBy: params?.sortBy,
      sortOrder: params?.sortOrder
    })

    const responses = await ProposedResponsesModel.findByLocationId(
      locationId,
      params?.sortBy || 'created_at',
      params?.sortOrder || 'desc'
    )

    logger.info('Proposed responses retrieved by location ID', {
      locationId,
      count: responses.length
    })

    return {
      success: true,
      data: responses,
      message: `Retrieved ${responses.length} proposed responses`
    }
  } catch (error) {
    logger.error('Error getting proposed responses by location ID', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve proposed responses'
    }
  }
}

/**
 * Get proposed responses by user ID grouped by location
 * Implements defensive programming with validation
 * Returns user with locations grouped, each location containing its proposed responses
 */
export async function getProposedResponsesByUserId(
  userId: string,
  params?: {
    sortBy?: 'created_at' | 'updated_at' | 'create_time'
    sortOrder?: 'asc' | 'desc'
  }
): Promise<ApiResponse<UserWithGroupedLocations>> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    // Defensive validation: Check if userId is provided
    if (!userId) {
      logger.warn('Attempted to get proposed responses without user ID')
      return {
        success: false,
        error: 'User ID is required',
        message: 'Cannot retrieve proposed responses without user ID'
      }
    }

    // Defensive validation: Validate UUID format
    if (!isValidUUID(userId)) {
      logger.warn('Invalid user ID format', { userId })
      return {
        success: false,
        error: 'Invalid user ID format',
        message: 'User ID must be a valid UUID'
      }
    }

    const allowed = isStaff || await hasUserOrganizationAccess(userId, organizationId)
    if (!allowed) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Getting proposed responses by user ID', {
      userId,
      sortBy: params?.sortBy,
      sortOrder: params?.sortOrder
    })

    const result = await ProposedResponsesModel.findByUserId(
      userId,
      params?.sortBy || 'created_at',
      params?.sortOrder || 'desc'
    )

    // Defensive check: User not found
    if (!result) {
      logger.warn('User not found when retrieving proposed responses', { userId })
      return {
        success: false,
        error: 'User not found',
        message: 'No user found with the provided ID'
      }
    }

    // Calculate total proposed responses count across all locations
    const totalResponses = result.locations.reduce(
      (sum, location) => sum + location.proposed_responses.length,
      0
    )

    logger.info('Proposed responses retrieved by user ID', {
      userId,
      locationsCount: result.locations.length,
      totalResponses
    })

    return {
      success: true,
      data: result,
      message: `Retrieved ${result.locations.length} locations with ${totalResponses} total proposed responses`
    }
  } catch (error) {
    logger.error('Error getting proposed responses by user ID', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve proposed responses'
    }
  }
}

/**
 * Get paginated proposed responses with filters
 * Implements defensive programming with validation and pagination
 */
export async function getPaginatedProposedResponses(
  params: ProposedResponsesQueryParams
): Promise<PaginatedResponse<ProposedResponseWithLocationRelation>> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    // Defensive validation: Set defaults
    const page = params.page && params.page > 0 ? params.page : 1
    const limit = params.limit && params.limit > 0 && params.limit <= 100 ? params.limit : 10
    const skip = (page - 1) * limit

    // Defensive validation: Validate UUIDs if provided
    if (params.locationId && !isValidUUID(params.locationId)) {
      logger.warn('Invalid location ID format', { locationId: params.locationId })
      return {
        success: false,
        error: 'Invalid location ID format',
        message: 'Location ID must be a valid UUID'
      }
    }

    if (params.userId && !isValidUUID(params.userId)) {
      logger.warn('Invalid user ID format', { userId: params.userId })
      return {
        success: false,
        error: 'Invalid user ID format',
        message: 'User ID must be a valid UUID'
      }
    }

    // Build where clause
    const where: Prisma.proposed_responsesWhereInput = isStaff ? {} : {
      OR: [
        {
          locations: {
            connections: {
              organization_id: organizationId
            }
          }
        },
        {
          users: {
            organization_id: organizationId
          }
        }
      ]
    }
    if (params.locationId) where.location_id = params.locationId
    if (params.userId) where.user_id = params.userId
    if (params.rating) where.rating = params.rating
    if (params.reviewerName) where.reviewer_name = { contains: params.reviewerName, mode: 'insensitive' }

    logger.debug('Getting paginated proposed responses', {
      page,
      limit,
      filters: where
    })

    const [responses, total, uniqueLocationIds] = await Promise.all([
      ProposedResponsesModel.findMany(
        where,
        params.sortBy || 'created_at',
        params.sortOrder || 'desc',
        skip,
        limit,
        true // Include locations relation
      ),
      ProposedResponsesModel.count(where),
      ProposedResponsesModel.findUniqueLocationIds(where)
    ])

    const uniqueLocations = uniqueLocationIds.length > 0
      ? await LocationsModel.findByIds(uniqueLocationIds, {
          id: true,
          name: true
        })
      : []

    const totalPages = Math.ceil(total / limit)
    const hasNext = page < totalPages
    const hasPrev = page > 1

    logger.info('Paginated proposed responses retrieved', {
      page,
      limit,
      total,
      totalPages,
      count: responses.length,
      uniqueLocationsCount: uniqueLocations.length
    })

    return {
      success: true,
      data: {
        responses,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext,
          hasPrev
        },
        uniqueLocations: uniqueLocations.map(l => ({ id: l.id, name: l.name }))
      },
      message: 'Proposed responses retrieved successfully'
    }
  } catch (error) {
    logger.error('Error getting paginated proposed responses', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve proposed responses'
    }
  }
}

/**
 * Update proposed response by ID
 * Implements defensive programming with existence check
 */
export async function updateProposedResponse(
  id: string,
  data: Partial<Omit<proposed_responses, 'id' | 'created_at'>>
): Promise<ApiResponse<proposed_responses>> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    // Defensive validation: Check if ID is provided
    if (!id) {
      logger.warn('Attempted to update proposed response without ID')
      return {
        success: false,
        error: 'ID is required',
        message: 'Cannot update proposed response without ID'
      }
    }

    // Defensive validation: Validate UUID format
    if (!isValidUUID(id)) {
      logger.warn('Invalid ID format', { id })
      return {
        success: false,
        error: 'Invalid ID format',
        message: 'ID must be a valid UUID'
      }
    }

    // Defensive validation: Check if data is provided
    if (!data || Object.keys(data).length === 0) {
      logger.warn('Attempted to update proposed response without data', { id })
      return {
        success: false,
        error: 'Update data is required',
        message: 'Cannot update proposed response without data'
      }
    }

    // Defensive validation: Validate UUIDs in update data if provided
    if (data.location_id && !isValidUUID(data.location_id)) {
      logger.warn('Invalid location_id in update data', { location_id: data.location_id })
      return {
        success: false,
        error: 'Invalid location_id format',
        message: 'Location ID must be a valid UUID'
      }
    }

    if (data.user_id && !isValidUUID(data.user_id)) {
      logger.warn('Invalid user_id in update data', { user_id: data.user_id })
      return {
        success: false,
        error: 'Invalid user_id format',
        message: 'User ID must be a valid UUID'
      }
    }

    if (data.location_id) {
      const allowed = isStaff || await hasLocationOrganizationAccess(data.location_id, organizationId)
      if (!allowed) {
        return {
          success: false,
          error: 'Unauthorized',
          message: 'Unauthorized organization access'
        }
      }
    }

    if (data.user_id) {
      const allowed = isStaff || await hasUserOrganizationAccess(data.user_id, organizationId)
      if (!allowed) {
        return {
          success: false,
          error: 'Unauthorized',
          message: 'Unauthorized organization access'
        }
      }
    }

    const existing = await ProposedResponsesModel.findById(id)
    if (!existing) {
      return {
        success: false,
        error: 'Proposed response not found',
        message: 'The proposed response you are trying to update does not exist'
      }
    }

    const allowed = isStaff || await hasProposedResponseAccess(existing, organizationId)
    if (!allowed) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Updating proposed response', { id, updateFields: Object.keys(data) })

    const response = await ProposedResponsesModel.update(id, data)

    logger.info('Proposed response updated successfully', {
      responseId: response.id,
      updatedFields: Object.keys(data)
    })

    return {
      success: true,
      data: response,
      message: 'Proposed response updated successfully'
    }
  } catch (error) {
    logger.error('Error updating proposed response', error)

    // Defensive error handling: Check for record not found
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return {
        success: false,
        error: 'Proposed response not found',
        message: 'The proposed response you are trying to update does not exist'
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to update proposed response'
    }
  }
}

/**
 * Delete proposed response by ID
 * Implements defensive programming with existence check
 */
export async function deleteProposedResponse(
  id: string
): Promise<ApiResponse<proposed_responses>> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    // Defensive validation: Check if ID is provided
    if (!id) {
      logger.warn('Attempted to delete proposed response without ID')
      return {
        success: false,
        error: 'ID is required',
        message: 'Cannot delete proposed response without ID'
      }
    }

    // Defensive validation: Validate UUID format
    if (!isValidUUID(id)) {
      logger.warn('Invalid ID format', { id })
      return {
        success: false,
        error: 'Invalid ID format',
        message: 'ID must be a valid UUID'
      }
    }

    // Check if record exists before deleting
    const existing = await ProposedResponsesModel.findById(id)
    if (!existing) {
      logger.warn('Attempted to delete non-existent proposed response', { id })
      return {
        success: false,
        error: 'Proposed response not found',
        message: 'Cannot delete proposed response that does not exist'
      }
    }

    const allowed = isStaff || await hasProposedResponseAccess(existing, organizationId)
    if (!allowed) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Deleting proposed response', { id })

    const response = await ProposedResponsesModel.delete(id)

    logger.info('Proposed response deleted successfully', {
      responseId: response.id,
      location_id: response.location_id
    })

    return {
      success: true,
      data: response,
      message: 'Proposed response deleted successfully'
    }
  } catch (error) {
    logger.error('Error deleting proposed response', error)

    // Defensive error handling: Check for record not found
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      return {
        success: false,
        error: 'Proposed response not found',
        message: 'The proposed response you are trying to delete does not exist'
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to delete proposed response'
    }
  }
}

/**
 * Upsert proposed response (create or update)
 * Implements defensive programming with validation
 */
export async function upsertProposedResponse(
  where: Prisma.proposed_responsesWhereUniqueInput,
  create: ProposedResponseToCreate,
  update: Partial<Omit<proposed_responses, 'id' | 'created_at'>>
): Promise<ApiResponse<proposed_responses>> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    // Defensive validation: Check if where clause is provided
    if (!where || Object.keys(where).length === 0) {
      logger.warn('Attempted to upsert proposed response without where clause')
      return {
        success: false,
        error: 'Where clause is required',
        message: 'Cannot upsert proposed response without where clause'
      }
    }

    // Defensive validation: Validate create data
    if (!create.rating) {
      logger.warn('Attempted to upsert proposed response without rating')
      return {
        success: false,
        error: 'Rating is required',
        message: 'Cannot upsert proposed response without rating'
      }
    }

    // Defensive validation: Validate UUIDs if provided
    if (create.location_id && !isValidUUID(create.location_id)) {
      logger.warn('Invalid location_id in create data', { location_id: create.location_id })
      return {
        success: false,
        error: 'Invalid location_id format',
        message: 'Location ID must be a valid UUID'
      }
    }

    if (create.user_id && !isValidUUID(create.user_id)) {
      logger.warn('Invalid user_id in create data', { user_id: create.user_id })
      return {
        success: false,
        error: 'Invalid user_id format',
        message: 'User ID must be a valid UUID'
      }
    }

    if (create.location_id) {
      const allowed = isStaff || await hasLocationOrganizationAccess(create.location_id, organizationId)
      if (!allowed) {
        return {
          success: false,
          error: 'Unauthorized',
          message: 'Unauthorized organization access'
        }
      }
    }

    if (create.user_id) {
      const allowed = isStaff || await hasUserOrganizationAccess(create.user_id, organizationId)
      if (!allowed) {
        return {
          success: false,
          error: 'Unauthorized',
          message: 'Unauthorized organization access'
        }
      }
    }

    if (update.location_id) {
      const allowed = isStaff || await hasLocationOrganizationAccess(update.location_id, organizationId)
      if (!allowed) {
        return {
          success: false,
          error: 'Unauthorized',
          message: 'Unauthorized organization access'
        }
      }
    }

    if (update.user_id) {
      const allowed = isStaff || await hasUserOrganizationAccess(update.user_id, organizationId)
      if (!allowed) {
        return {
          success: false,
          error: 'Unauthorized',
          message: 'Unauthorized organization access'
        }
      }
    }

    logger.debug('Upserting proposed response', {
      where,
      hasUpdateData: Object.keys(update).length > 0
    })

    const response = await ProposedResponsesModel.upsert(where, create, update)

    logger.info('Proposed response upserted successfully', {
      responseId: response.id,
      location_id: response.location_id
    })

    return {
      success: true,
      data: response,
      message: 'Proposed response upserted successfully'
    }
  } catch (error) {
    logger.error('Error upserting proposed response', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to upsert proposed response'
    }
  }
}

/**
 * Send proposed responses to Google My Business
 * Wrapper around sendReviewsToGmb that handles token retrieval and data mapping
 * 
 * This function:
 * - Gets Google access token for the user
 * - Fetches proposed responses from database
 * - Maps proposed responses to ReviewToSendToGmb format
 * - Calls sendReviewsToGmb to send responses to GMB API
 * 
 * @param clerkUserId - Clerk user ID to get Google access token
 * @param responseIds - Array of proposed response IDs to send
 * @returns Result of sending reviews to GMB
 */
export async function sendProposedResponsesToGmb(
  clerkUserId: string,
  responseIds: string[]
): Promise<{
  success: boolean
  message: string
  error?: string
}> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    logger.debug('Sending proposed responses to GMB', {
      clerkUserId,
      responseCount: responseIds.length
    })

    // Validate input
    if (!clerkUserId) {
      logger.warn('Attempted to send responses without clerkUserId')
      return {
        success: false,
        message: 'User ID is required',
        error: 'Clerk user ID is missing'
      }
    }

    if (!responseIds || responseIds.length === 0) {
      logger.warn('Attempted to send responses with empty array')
      return {
        success: false,
        message: 'No responses selected',
        error: 'At least one response ID is required'
      }
    }

    // Get Google access token
    const { getGoogleAccessToken } = await import('../clerk/users.action')
    const tokenResult = await getGoogleAccessToken(clerkUserId)
    
    if (!tokenResult.success || !tokenResult.token) {
      logger.error('Failed to get Google access token', {
        clerkUserId,
        error: tokenResult.error,
        isExpired: tokenResult.isExpired
      })
      return {
        success: false,
        message: 'Failed to get Google access token. Please reconnect your Google account.',
        error: tokenResult.error || 'Token not found'
      }
    }

    // Get proposed responses from database
    const responses = await Promise.all(
      responseIds.map(id => ProposedResponsesModel.findById(id))
    )

    // Filter out null responses and validate required fields
    const validResponses = responses.filter((response): response is proposed_responses => {
      if (!response) {
        logger.warn('Proposed response not found', { responseIds })
        return false
      }
      if (!response.reply_url) {
        logger.warn('Proposed response missing reply_url', { id: response.id })
        return false
      }
      if (!response.response) {
        logger.warn('Proposed response missing response text', { id: response.id })
        return false
      }
      return true
    })

    if (validResponses.length === 0) {
      logger.warn('No valid responses to send', {
        requested: responseIds.length,
        valid: 0
      })
      return {
        success: false,
        message: 'No valid responses to send. Ensure all responses have a reply URL and response text.',
        error: 'No valid responses'
      }
    }

    const allowedResponses = []
    for (const response of validResponses) {
      const allowed = isStaff || await hasProposedResponseAccess(response, organizationId)
      if (allowed) {
        allowedResponses.push(response)
      }
    }

    if (!allowedResponses.length) {
      return {
        success: false,
        message: 'Unauthorized organization access',
        error: 'Unauthorized'
      }
    }

    // Map proposed responses to ReviewToSendToGmb format
    const { sendReviewsToGmb } = await import('../gmb/reviews.action')
    
    const reviewsToSend = allowedResponses.map(response => ({
      review_url: response.reply_url!,
      response: response.response!,
      token: tokenResult.token!,
      location_id: response.location_id ?? null,
      reviewer_name: response.reviewer_name,
      rating: response.rating,
      comment: response.comment,
      create_time: response.create_time,
      instructions: null,
      prompt_context_tone: null,
      prompt_context_handle_one_star: null,
      prompt_context_instructions: null
    }))

    // Send reviews to GMB
    const result = await sendReviewsToGmb(reviewsToSend)

    // Delete proposed responses from database if all were sent successfully
    if (result.success && allowedResponses.length > 0) {
      try {
        // Delete all proposed responses that were sent successfully
        const responseIdsToDelete = allowedResponses.map(r => r.id)
        const deleteResult = await ProposedResponsesModel.deleteMany({
          id: { in: responseIdsToDelete }
        })
        
        logger.info('Deleted proposed responses after successful send', {
          clerkUserId,
          deletedCount: deleteResult.count,
          requestedCount: responseIdsToDelete.length,
          responseIds: responseIdsToDelete
        })
      } catch (deleteError) {
        // Log error but don't fail the operation since responses were already sent
        logger.error('Error deleting proposed responses after send', deleteError, {
          clerkUserId,
          responseIds: allowedResponses.map(r => r.id)
        })
      }
    } else if (!result.success) {
      logger.warn('Not deleting proposed responses due to partial failure', {
        clerkUserId,
        requested: responseIds.length,
        valid: allowedResponses.length,
        message: result.message
      })
    }

    logger.info('Proposed responses sent to GMB', {
      clerkUserId,
      requested: responseIds.length,
      valid: allowedResponses.length,
      success: result.success,
      message: result.message
    })

    return {
      success: result.success,
      message: result.message
    }
  } catch (error) {
    logger.error('Error sending proposed responses to GMB', error, {
      clerkUserId,
      responseCount: responseIds.length
    })
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to send responses',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Helper function to validate UUID format
 * Implements defensive programming utility
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

