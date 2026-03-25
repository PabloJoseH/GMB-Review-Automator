/**
 * @fileoverview Locations server actions for Supabase persistence.
 *
 * @remarks
 * Provides query helpers (`LocationsQueryParams`, `PaginatedLocationsResponse`), onboarding
 * utilities (bulk activation/deactivation, selection sync), integration helpers for Google
 * My Business (locations fetch, reviews processing, Pub/Sub management), and subscription
 * recalculation hooks used across dashboards and onboarding flows.
 */
'use server'

import { LocationsModel } from '../../models/supabase/locations.model'
import { createLogger } from '@/lib/logger'
import { serializeDecimalLocation } from '@/lib/utils'
import type { LocationWithConnection, SerializedLocationWithConnection } from '@/lib/prisma-types'
import { getAuthenticatedOrganizationAccess, requireServerActionUser } from '@/lib/server-action-auth'
import { checkIfStaff } from '@/lib/auth-helpers'

const logger = createLogger('LOCATIONS')

async function getOrganizationAccessForAdmin(requestedOrganizationId?: string) {
  const { clerkUserId } = await requireServerActionUser()
  const isStaff = await checkIfStaff(clerkUserId)

  if (isStaff) {
    return { isStaff, organizationId: requestedOrganizationId }
  }

  const { organizationId } = await getAuthenticatedOrganizationAccess()
  return { isStaff, organizationId }
}

import type { locations, opening_hours, location_status } from '../../../app/generated/prisma'
import { recalculateSubscriptionLocationCount, recalculateSubscriptionLocationCountInternal } from './subscriptions.action'
import { prisma } from '@/lib/prisma'
import { ConnectionsModel } from '@/server/models/supabase/connections.model'
import { UsersModel } from '@/server/models/supabase/users.model'
import { GmbPubSubModel } from '@/server/models/gmb/pub-sub.model'
import { getGoogleAccessToken } from '@/server/actions/clerk/users.action'
import { GmbReviewsModel } from '@/server/models/gmb/reviews.model'
import { OpenAIConversations, summarizeMessages } from '@/server/models/openAI/conversation.model'
import { GlobalConfigModel } from '@/server/models/supabase/global-config.model'
import { PromptContextModel } from '@/server/models/supabase/prompt-context.model'
import { APP_CONSTANTS } from '@/lib/constants'
import { safeCall, type GlobalRateLimitState } from '@/lib/api-helpers'
import { formatReviewsAsMessages } from '@/server/actions/gmb/reviews.action'

async function hasConnectionOrganizationAccess(connectionId: string, organizationId: string): Promise<boolean> {
  const connection = await prisma.connections.findFirst({
    where: {
      id: connectionId,
      organization_id: organizationId
    },
    select: { id: true }
  })

  return !!connection
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

export interface LocationsQueryParams {
  page: number
  limit: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  status?: location_status
  userId?: string
  googleLocationId?: string
  connectionId?: string
  organizationId?: string
  createdBy?: string
}

export interface PaginatedLocationsResponse {
  locations: SerializedLocationWithConnection[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

/**
 * Overview: Locations actions for Prisma (Supabase)
 * - CRUD helpers for `locations` table
 * - Lookups by user ID and Google ID
 * - Manages pubsub subscriptions based on active locations status
 * - Creates prompt contexts with reviews summaries when locations are activated (inactive -> active)
 */

/**
 * Helper function to check if a connection has any active locations
 * @param connectionId - Connection ID to check
 * @returns true if connection has at least one active location, false otherwise
 */
async function connectionHasActiveLocations(connectionId: string): Promise<boolean> {
  try {
    const activeLocations = await prisma.locations.count({
      where: {
        connection_id: connectionId,
        status: 'active'
      }
    })
    return activeLocations > 0
  } catch (error) {
    logger.error('Error checking active locations for connection', { connectionId, error })
    return false
  }
}

/**
 * Count active locations for an organization
 * @param organizationId - Organization ID to count active locations for
 * @returns Number of active locations for the organization
 */
export async function countActiveLocationsByOrganizationId(organizationId: string): Promise<number> {
  try {
    const { isStaff, organizationId: authenticatedOrganizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff && organizationId !== authenticatedOrganizationId) {
      return 0
    }

    logger.debug('Counting active locations for organization', { organizationId })

    const count = await prisma.locations.count({
      where: {
        status: 'active',
        connections: {
          organization_id: organizationId
        }
      }
    })

    logger.debug('Active locations count retrieved', {
      organizationId,
      count
    })

    return count
  } catch (error) {
    logger.error('Error counting active locations for organization', error, { organizationId })
    return 0
  }
}

/**
 * Helper function to manage pubsub subscription based on connection's active locations
 * - If connection has active locations but is not subscribed, subscribes it
 * - If connection has no active locations but is subscribed, unsubscribes it
 * @param connectionId - Connection ID to check
 * @param externalAccountId - Google account ID (format: "accounts/123456789")
 * @param userId - User ID for getting access token
 * @returns Result of subscription management
 */
async function manageConnectionPubSubSubscription(
  connectionId: string,
  externalAccountId: string,
  userId: string
): Promise<{ subscribed: boolean; unsubscribed: boolean; error?: string }> {
  try {
    const hasActiveLocations = await connectionHasActiveLocations(connectionId)
    
    // Get connection to check current pub_sub status
    const connections = await ConnectionsModel.findConnectionsByExternalIds([externalAccountId])
    const connection = connections[0]
    
    if (!connection) {
      logger.debug('Connection not found for pubsub management', { connectionId, externalAccountId })
      return { subscribed: false, unsubscribed: false, error: 'Connection not found' }
    }

    // Get user to obtain clerk_id for access token
    const dbUser = await UsersModel.findUserById(userId)
    if (!dbUser || !dbUser.clerk_id) {
      logger.debug('User not found or missing clerk_id for pubsub management', { userId })
      return { subscribed: false, unsubscribed: false, error: 'User not found or missing clerk_id' }
    }

    // Get access token
    const accessToken = await getGoogleAccessToken(dbUser.clerk_id)
    if (!accessToken.success || !accessToken.token) {
      logger.debug('Failed to get Google access token for pubsub management', { userId, clerkId: dbUser.clerk_id })
      return { subscribed: false, unsubscribed: false, error: 'Failed to get Google access token' }
    }

    // If connection has active locations but is not subscribed, subscribe it
    if (hasActiveLocations && !connection.pub_sub) {
      logger.debug('Subscribing connection to pubsub (has active locations)', {
        connectionId,
        externalAccountId,
        userId
      })
      
      await GmbPubSubModel.subscribeAccountToGooglePubSub(externalAccountId, accessToken.token as string)
      
      // Update connection in database
      await ConnectionsModel.updateManyConnectionsByExternalId([{
        external_account_id: externalAccountId,
        data: { pub_sub: true } as Partial<Omit<import('../../../app/generated/prisma').connections, 'id' | 'created_at' | 'updated_at'>>
      }])
      
      return { subscribed: true, unsubscribed: false }
    }

    // If connection has no active locations but is subscribed, unsubscribe it
    if (!hasActiveLocations && connection.pub_sub) {
      logger.debug('Unsubscribing connection from pubsub (no active locations)', {
        connectionId,
        externalAccountId,
        userId
      })
      
      await GmbPubSubModel.unsubscribeAccountFromGooglePubSub(externalAccountId, accessToken.token as string)
      
      // Update connection in database
      await ConnectionsModel.updateManyConnectionsByExternalId([{
        external_account_id: externalAccountId,
        data: { pub_sub: false } as Partial<Omit<import('../../../app/generated/prisma').connections, 'id' | 'created_at' | 'updated_at'>>
      }])
      
      return { subscribed: false, unsubscribed: true }
    }

    // No change needed
    return { subscribed: false, unsubscribed: false }
  } catch (error) {
    logger.error('Error managing connection pubsub subscription', {
      connectionId,
      externalAccountId,
      userId,
      error
    })
    return {
      subscribed: false,
      unsubscribed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

function buildWhereClause(params: LocationsQueryParams) {
  return LocationsModel.buildWhereClause({
    search: params.search,
    status: params.status,
    userId: params.userId,
    googleLocationId: params.googleLocationId,
    connectionId: params.connectionId,
    organizationId: params.organizationId,
    createdBy: params.createdBy
  })
}


/**
 * Generates a summary of reviews using OpenAI for a specific location with rate limit protection
 * @param locationId - Location ID to generate summary for
 * @param location - Location object with google_location_id and connections
 * @param accessToken - Google access token for API calls
 * @param globalRateLimitState - Optional shared state to coordinate cooldowns across callers
 * @param rateLimitTracker - Optional object to track when rate limits occur
 * @returns Summary string or null on error
 */
async function generateLocationReviewsSummary(
  locationId: string,
  location: { google_location_id: string | null; connections?: { external_account_id: string } | null },
  accessToken: string,
  globalRateLimitState?: GlobalRateLimitState,
  rateLimitTracker?: { hasRateLimit: boolean }
): Promise<string | null> {
  try {
    logger.debug('Generating reviews summary for location', { locationId })

    // Get reviews from GMB API
    const reviews = await GmbReviewsModel.processLocationReviews(
      {
        id: locationId,
        google_location_id: location.google_location_id ?? null,
        connections: location.connections ? {
          id: '',
          external_account_id: location.connections.external_account_id
        } : null
      },
      accessToken,
      APP_CONSTANTS.gmb.maxReviewsPerLocation
    )

    if (!reviews || reviews.length === 0) {
      logger.debug('No reviews found for location', { locationId })
      return null
    }

    // Format reviews as messages
    const messages = await formatReviewsAsMessages(reviews)
    
    // Create conversation
    const conversationId = await OpenAIConversations.createConversation(messages)
    
    // Get global config for model settings
    const globalConfig = await GlobalConfigModel.findActive()
    let summaryModel: string = APP_CONSTANTS.openAi.models.defaultSummary
    let summaryMaxTokens: number = APP_CONSTANTS.openAi.request.summaryMaxTokens

    if (globalConfig) {
      if (globalConfig.responder_model) {
        summaryModel = globalConfig.responder_model as string
      }
      if (globalConfig.responder_max_tokens) {
        summaryMaxTokens = globalConfig.responder_max_tokens as number
      }
    }

    // Generate summary with rate limit protection
    const summary = await safeCall(
      async () => {
        return await summarizeMessages(
          conversationId,
          summaryModel,
          summaryMaxTokens * APP_CONSTANTS.openAi.request.summaryModelMultiplier,
          'reviews'
        )
      },
      APP_CONSTANTS.openAi.rateLimit.retryAttempts,
      undefined,
      rateLimitTracker,
      globalRateLimitState
    )
    
    logger.debug('Reviews summary generated for location', { 
      locationId,
      reviewCount: reviews.length,
      summaryLength: summary.length 
    })

    return summary || null
  } catch (error) {
    logger.error('Error generating reviews summary for location', {
      error,
      locationId
    })
    return null
  }
}

/**
 * Creates or updates prompt context with reviews summary for locations that are being activated
 */
async function createPromptContextForActivatedLocations(
  locationsToActivate: Array<{
    id: string
    google_location_id: string | null
    connections?: { external_account_id: string } | null
  }>,
  userId: string
): Promise<void> {
  if (locationsToActivate.length === 0) {
    return
  }

  try {
    logger.debug('Creating prompt contexts for activated locations', {
      locationCount: locationsToActivate.length,
      userId
    })

    // Get user to obtain clerk_id for access token
    const dbUser = await UsersModel.findUserById(userId)
    if (!dbUser || !dbUser.clerk_id) {
      logger.debug('User not found or missing clerk_id for prompt context creation', { userId })
      return
    }

    // Get access token
    const accessToken = await getGoogleAccessToken(dbUser.clerk_id)
    if (!accessToken.success || !accessToken.token) {
      logger.debug('Failed to get Google access token for prompt context creation', {
        userId,
        clerkId: dbUser.clerk_id
      })
      return
    }

    // Generate summaries for all locations in parallel
    // Use shared global rate limit state to coordinate cooldowns across parallel calls
    const globalRateLimitState: GlobalRateLimitState = { cooldownUntil: 0 }
    const locationSummaries = await Promise.all(
      locationsToActivate.map(async (location) => {
        try {
          const rateLimitTracker = { hasRateLimit: false }
          const summary = await generateLocationReviewsSummary(
            location.id,
            location,
            accessToken.token as string,
            globalRateLimitState,
            rateLimitTracker
          )
          return { locationId: location.id, summary }
        } catch (error) {
          logger.error('Error generating summary for location during activation', {
            error,
            locationId: location.id
          })
          return { locationId: location.id, summary: null }
        }
      })
    )

    // Upsert prompt contexts with summaries
    await PromptContextModel.upsertSummaries(locationSummaries)
    
    logger.debug('Prompt contexts created/updated for activated locations', {
      locationCount: locationSummaries.length,
      summariesGenerated: locationSummaries.filter(s => s.summary !== null).length
    })
  } catch (error) {
    logger.error('Error creating prompt contexts for activated locations', {
      error,
      locationCount: locationsToActivate.length,
      userId
    })
  }
}

interface ConnectionPubSubPayload {
  connectionId: string
  externalAccountId: string
  userId: string
}

interface PromptContextLocationPayload {
  id: string
  google_location_id: string | null
  connections?: { external_account_id: string } | null
}

/**
 * Executes Pub/Sub subscription management for a group of connections in parallel.
 */
async function handlePubSubManagementForConnections(connections: ConnectionPubSubPayload[]): Promise<void> {
  if (connections.length === 0) {
    return
  }

  const pubsubResults = await Promise.allSettled(
    connections.map(conn =>
      manageConnectionPubSubSubscription(conn.connectionId, conn.externalAccountId, conn.userId)
    )
  )

  let subscribedCount = 0
  let unsubscribedCount = 0

  pubsubResults.forEach((result, index) => {
    const connection = connections[index]
    if (result.status === 'rejected') {
      logger.debug('Failed to manage pubsub subscription for connection', {
        connectionId: connection.connectionId,
        externalAccountId: connection.externalAccountId,
        error: result.reason
      })
      return
    }

    if (result.value.subscribed) {
      subscribedCount += 1
    }
    if (result.value.unsubscribed) {
      unsubscribedCount += 1
    }

    if (result.value.error) {
      logger.debug('Error managing pubsub subscription for connection', {
        connectionId: connection.connectionId,
        externalAccountId: connection.externalAccountId,
        error: result.value.error
      })
    }
  })

  logger.debug('Pubsub subscription management completed', {
    subscribed: subscribedCount,
    unsubscribed: unsubscribedCount,
    totalConnections: connections.length
  })
}

/**
 * Generates prompt contexts for locations transitioning to active status.
 * @param locationsToActivate - Locations that require prompt context creation
 * @param userId - User responsible for the activation
 */
async function handlePromptContextCreationForLocations(
  locationsToActivate: PromptContextLocationPayload[],
  userId: string
): Promise<void> {
  if (locationsToActivate.length === 0) {
    return
  }

  logger.debug('Creating prompt contexts for newly activated locations', {
    locationCount: locationsToActivate.length
  })

  try {
    await createPromptContextForActivatedLocations(locationsToActivate, userId)
  } catch (error) {
    logger.error('Failed to create prompt contexts for activated locations', {
      error: error instanceof Error ? error.message : 'Unknown error',
      locationCount: locationsToActivate.length
    })
  }
}

/**
 * Recalculates Stripe subscription location counts for affected organizations.
 * @param organizationIds - Organizations to recalculate
 */
async function handleSubscriptionRecalculationForOrganizations(organizationIds: string[]): Promise<void> {
  if (organizationIds.length === 0) {
    return
  }

  const recalculationResults = await Promise.allSettled(
    organizationIds.map(orgId => recalculateSubscriptionLocationCount(orgId))
  )

  const successfulRecalculations = recalculationResults.filter(result => result.status === 'fulfilled').length
  const failedRecalculations = recalculationResults.filter(result => result.status === 'rejected').length

  logger.debug('Subscription recalculation completed', {
    successful: successfulRecalculations,
    failed: failedRecalculations,
    total: organizationIds.length
  })

  recalculationResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.debug('Failed to recalculate subscription for organization', {
        organizationId: organizationIds[index],
        error: result.reason
      })
    }
  })
}

/**
 * Internal: Recalculates subscription (Stripe + Supabase) for organizations without auth.
 * For use only by updateMultipleLocationsStatusByIdsForUser. Not for public use.
 */
async function handleSubscriptionRecalculationForOrganizationsInternal(organizationIds: string[]): Promise<void> {
  if (organizationIds.length === 0) {
    return
  }

  const recalculationResults = await Promise.allSettled(
    organizationIds.map(orgId => recalculateSubscriptionLocationCountInternal(orgId))
  )

  const successfulRecalculations = recalculationResults.filter(result => result.status === 'fulfilled').length
  const failedRecalculations = recalculationResults.filter(result => result.status === 'rejected').length

  logger.debug('Subscription recalculation completed (internal)', {
    successful: successfulRecalculations,
    failed: failedRecalculations,
    total: organizationIds.length
  })

  recalculationResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.debug('Failed to recalculate subscription for organization (internal)', {
        organizationId: organizationIds[index],
        error: result.reason
      })
    }
  })
}

/**
 * get paginated locations
 */
export async function getPaginatedLocations(params: LocationsQueryParams) : Promise<PaginatedLocationsResponse> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin(params.organizationId)
    if (!isStaff && params.organizationId && params.organizationId !== organizationId) {
      return {
        locations: [] as SerializedLocationWithConnection[],
        pagination: {
          page: params.page,
          limit: params.limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        }
      }
    }

    logger.debug('Getting paginated locations', {
      page: params.page,
      limit: params.limit,
    })
    
    const offset = (params.page - 1) * params.limit
    const scopedOrganizationId = isStaff ? params.organizationId : organizationId
    const where = buildWhereClause({ ...params, organizationId: scopedOrganizationId })
    const sortBy = params.sortBy || 'created_at'
    const sortOrder = params.sortOrder || 'desc'
    
    const { locations, totalCount } = await LocationsModel.findManyWithRelations(where, sortBy, sortOrder, offset, params.limit, true) as { locations: LocationWithConnection[], totalCount: number }

    const serializedLocations = locations.map(location => serializeDecimalLocation(location))

    return {
      locations: serializedLocations,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / params.limit),
        hasNext: params.page < Math.ceil(totalCount / params.limit),
        hasPrev: params.page > 1
      }
    }
  } catch (error) {
    logger.error('Error getting paginated locations', error)
    return {
      locations: [] as SerializedLocationWithConnection[],
      pagination: {
        page: params.page,
        limit: params.limit,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      }
    }
  }
}


/**
 * Find location by user ID
 */
export async function findLocationByUserId(userId: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const user = await UsersModel.findUserById(userId)
    if (!isStaff && (!user || user.organization_id !== organizationId)) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Finding location by user ID', { userId })

    const location = await LocationsModel.findByUserId(userId)

    if (!location) {
      return {
        success: false,
        error: 'user not found',
        message: 'No location found with this user ID'
      }
    }
    
    logger.debug('Locations retrieved successfully', { 
      userId: userId,
      locations: location.length,
    })

    return {
      success: true,
      data: location,
      message: 'Locations retrieved successfully'
    }

  } catch (error) {
    logger.error('Error finding locations by user ID', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error finding locations by user ID',
      message: 'Error finding locations by user ID'
    }
  }
}

/**
 * Find location by Google ID
 */
export async function findLocationByGoogleId(googleId: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    logger.debug('Finding location by Google ID', { googleId })

    const location = await LocationsModel.findByGoogleId(googleId)

    if (!location) {
      return {
        success: false,
        error: 'location not found',
        message: 'No location found with this Google ID'
      }
    }

    const allowed = isStaff || await hasLocationOrganizationAccess(location.id, organizationId)
    if (!allowed) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }
    
    logger.debug('Location retrieved successfully', { 
      googleId: googleId,
      name: location.name,
      status: location.status,
    })

    return {
      success: true,
      data: location,
      message: 'Location retrieved successfully'
    }

  } catch (error) {
    logger.error('Error finding location by Google ID', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error finding location by Google ID',
      message: 'Error finding location by Google ID'
    }
  }
}

/**
 * Get location by ID (lightweight, no relations)
 * Used in: location headers, simple lookups
 */
export async function getLocationById(id: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const allowed = isStaff || await hasLocationOrganizationAccess(id, organizationId)
    if (!allowed) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Getting location by ID', { locationId: id })

    const location = await LocationsModel.findById(id)

    if (!location) {
      return {
        success: false,
        error: 'Location not found',
        message: 'No location found with this ID'
      }
    }

    // Serialize Decimal lat/lng for client components
    const serializedLocation = serializeDecimalLocation(location)

    logger.debug('Location retrieved successfully', { 
      locationId: location.id,
      name: location.name,
    })

    return {
      success: true,
      data: serializedLocation,
      message: 'Location retrieved successfully'
    }
  } catch (error) {
    logger.error('Error getting location by ID', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error getting location by ID',
      message: 'Error getting location by ID'
    }
  }
}

/**
 * Get location by ID with relations
 * Used in: location detail pages
 */
export async function getLocationByIdWithRelations(id: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const allowed = isStaff || await hasLocationOrganizationAccess(id, organizationId)
    if (!allowed) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Getting location by ID with relations', { locationId: id })

    const location = await LocationsModel.findByIdWithRelations(id)

    if (!location) {
      return {
        success: false,
        error: 'Location not found',
        message: 'No location found with this ID'
      }
    }

    // Serialize Decimal lat/lng for client components
    const serializedLocation = serializeDecimalLocation(location)

    logger.debug('Location with relations retrieved successfully', { 
      locationId: location.id,
      name: location.name,
    })

    return {
      success: true,
      data: serializedLocation,
      message: 'Location retrieved successfully'
    }
  } catch (error) {
    logger.error('Error getting location by ID with relations', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error getting location by ID with relations',
      message: 'Error getting location by ID with relations'
    }
  }
}

/**
 * Find active locations by user ID
 */
export async function findActiveLocations(userId: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const user = await UsersModel.findUserByIdMinimal(userId)
    if (!isStaff && (!user || user.organization_id !== organizationId)) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Finding active locations by user ID', { userId })

    const locations = await LocationsModel.findActiveLocations(userId) as locations[]

    if (!locations) {
      return {
        success: false,
        error: 'locations not found',
        message: 'No active locations found with this user ID'
      }
    }

    return locations

  } catch (error) {
    logger.error('Error finding active locations by user ID', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error finding active locations by user ID',
      message: 'Error finding active locations by user ID'
    }
  }
}

/**
 * Find active locations by user ID with prompt context
 * @param userId - User ID to find locations for
 * @returns Array of active locations with prompt context
 */
export async function findActiveLocationsWithPromptContext(userId: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const user = await UsersModel.findUserByIdMinimal(userId)
    if (!isStaff && (!user || user.organization_id !== organizationId)) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access',
        data: []
      }
    }

    logger.debug('Finding active locations by user ID with prompt context', { userId })

    const locations = await LocationsModel.findActiveLocationsWithPromptContext(userId)

    return {
      success: true,
      data: locations,
      message: 'Active locations retrieved successfully'
    }
  } catch (error) {
    logger.error('Error finding active locations by user ID with prompt context', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error finding active locations by user ID with prompt context',
      message: 'Error finding active locations by user ID with prompt context',
      data: []
    }
  }
}

/**
 * Find active locations by organization ID with prompt context
 * @param organizationId - Organization ID to find locations for
 * @returns Array of active locations with prompt context
 */
export async function findActiveLocationsByOrganizationIdWithPromptContext(organizationId: string) {
  try {
    const { isStaff, organizationId: authenticatedOrganizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff && organizationId !== authenticatedOrganizationId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access',
        data: []
      }
    }

    logger.debug('Finding active locations by organization ID with prompt context', { organizationId })

    const locations = await LocationsModel.findActiveLocationsByOrganizationIdWithPromptContext(organizationId)

    return {
      success: true,
      data: locations,
      message: 'Active locations retrieved successfully'
    }
  } catch (error) {
    logger.error('Error finding active locations by organization ID with prompt context', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error finding active locations by organization ID with prompt context',
      message: 'Error finding active locations by organization ID with prompt context',
      data: []
    }
  }
}


/**
 * Create location
 * Always creates locations with status = 'inactive'
 * Status cannot be set during creation - it must be activated via payment integration
 */
export async function createLocation(locationData: Omit<locations, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'status'>) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const allowedConnection = isStaff || await hasConnectionOrganizationAccess(locationData.connection_id, organizationId)
    if (!allowedConnection) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Creating location', { locationData })

    // Explicitly exclude status from input - it will always be set to 'inactive'
    // TypeScript already excludes status from the type, but we add runtime check for safety
    const dataWithoutStatus = locationData

    const location = await LocationsModel.createLocation(dataWithoutStatus)

    logger.debug('Location created successfully', { 
      locationId: location.id,
      name: location.name,
      status: location.status, // Will always be 'inactive'
    })

    return {
      success: true,
      data: location,
      message: 'Location created successfully'
    }

  } catch (error) {
    logger.error('Error creating location', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error creating location',
      message: 'Error creating location'
    }
  }
}

/**
 * Update location
 * Status cannot be updated via this function - use updateMultipleLocationsStatusByIds for status changes
 */
export async function updateLocation(id: string, locationData: Omit<locations, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'status'>) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const allowedLocation = isStaff || await hasLocationOrganizationAccess(id, organizationId)
    if (!allowedLocation) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    const allowedConnection = isStaff || await hasConnectionOrganizationAccess(locationData.connection_id, organizationId)
    if (!allowedConnection) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Updating location', { id })

    // Explicitly exclude status from update data
    // TypeScript already excludes status from the type, but we ensure it's not included
    const updateData = locationData

    const location = await LocationsModel.updateLocation(id, updateData)

    if (!location) {
      return {
        success: false,
        error: 'location not found',
        message: 'No location found with this ID'
      }
    }

    logger.debug('Location updated successfully', { 
      locationId: location.id,
      name: location.name,
      status: location.status,
    })

    const serializedLocation = serializeDecimalLocation(location)

    return {
      success: true,
      data: serializedLocation,
      message: 'Location updated successfully'
    }

  } catch (error) {
    logger.error('Error updating location', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error updating location',
      message: 'Error updating location'
    }
  }
}

/**
 * Delete location
 * Also recalculates subscription location counts if the deleted location was active
 */
export async function deleteLocation(id: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const allowed = isStaff || await hasLocationOrganizationAccess(id, organizationId)
    if (!allowed) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Deleting location', { id })

    // 1. Get location with connection to find organization_id before deleting
    const locationToDelete = await prisma.locations.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        connection_id: true,
        connections: {
          select: {
            organization_id: true
          }
        }
      }
    })

    if (!locationToDelete) {
      return {
        success: false,
        error: 'location not found',
        message: 'No location found with this ID'
      }
    }

    const wasActive = locationToDelete.status === 'active'
    const locationOrganizationId = locationToDelete.connections?.organization_id

    // 2. Delete the location
    const location = await LocationsModel.deleteLocation(id)

    logger.debug('Location deleted successfully', { 
      locationId: location.id,
      name: location.name,
      status: location.status,
      wasActive
    })

    // 3. Recalculate subscription count if location was active
    // This ensures the subscription count is updated when an active location is deleted
    if (wasActive && locationOrganizationId) {
      logger.debug('Recalculating subscription count after deleting active location', {
        organizationId: locationOrganizationId,
        deletedLocationId: id
      })

      // Recalculate in background (non-blocking)
      recalculateSubscriptionLocationCount(locationOrganizationId).catch(error => {
        logger.debug('Failed to recalculate subscription after location deletion', {
          organizationId: locationOrganizationId,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        // Don't fail the deletion if recalculation fails
      })
    }

    return {
      success: true,
      data: location,
      message: 'Location deleted successfully'
    }

  } catch (error) {
    logger.error('Error deleting location', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error deleting location',
      message: 'Error deleting location'
    }
  }
}

/**
 * Upsert location with hours
 * - Always creates locations with status = 'inactive'
 * - Status cannot be set or updated via this function
 */
export async function upsertLocationWithHours(googleLocationId: string, locationData: Omit<locations, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'status' | 'reference'>, validHours: Omit<opening_hours, 'location_id'>[], userId: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const user = await UsersModel.findUserById(userId)
    if (!isStaff && (!user || user.organization_id !== organizationId)) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    const allowedConnection = isStaff
      || (organizationId ? await hasConnectionOrganizationAccess(locationData.connection_id, organizationId) : false)
    if (!allowedConnection) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Upserting location with hours', {  name: locationData.name })

    // Explicitly exclude status from input - it will always be set to 'inactive' on create
    // and will never be updated via this function
    // TypeScript already excludes status from the type, ensuring type safety
    const location = await LocationsModel.upsertLocationWithHours(googleLocationId, locationData, validHours, userId)

    logger.debug('Location upserted successfully', { 
      locationId: location.id,
      name: location.name,
      status: location.status,
    })

    return {
      success: true,
      data: location,
      message: 'Location upserted successfully'
    }

  } catch (error) {
    logger.error('Error upserting location with hours', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error upserting location with hours',
      message: 'Error upserting location with hours'
    }
  }
}

/**
 * Update multiple locations status by Google Location IDs
 * Used during onboarding to activate selected locations
 * Also recalculates subscription location counts for affected organizations
 * Now also manages pubsub subscriptions based on active locations
 */
export async function updateMultipleLocationsStatus(googleLocationIds: string[], status: locations['status'], userId: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const user = await UsersModel.findUserById(userId)
    if (!isStaff && (!user || user.organization_id !== organizationId)) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Updating multiple locations status', { 
      count: googleLocationIds.length,
      status,
      userId 
    })

    // 1. Get locations with their connections to find organization IDs and connection info
    // Also get current status to detect inactive -> active transitions
    const locationsWithConnections = await prisma.locations.findMany({
      where: isStaff
        ? { google_location_id: { in: googleLocationIds } }
        : {
            google_location_id: { in: googleLocationIds },
            connections: {
              organization_id: organizationId
            }
          },
      select: {
        id: true,
        google_location_id: true,
        connection_id: true,
        status: true,
        connections: {
          select: {
            id: true,
            organization_id: true,
            external_account_id: true,
            user_id: true
          }
        }
      }
    })

    if (!isStaff && locationsWithConnections.length !== googleLocationIds.length) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    // Identify locations that are transitioning from inactive to active
    const locationsToActivate = locationsWithConnections.filter(
      loc => loc.status === 'inactive' && status === 'active'
    )

    // Extract unique organization IDs
    const organizationIds = [...new Set(
      locationsWithConnections
        .map(loc => loc.connections?.organization_id)
        .filter((id): id is string => id !== null && id !== undefined)
    )]

    // Extract unique connections (by connection_id) for pubsub management
    const uniqueConnections = new Map<string, {
      connectionId: string
      externalAccountId: string
      userId: string
    }>()
    
    locationsWithConnections.forEach(loc => {
      if (loc.connections) {
        const connId = loc.connection_id
        if (!uniqueConnections.has(connId)) {
          uniqueConnections.set(connId, {
            connectionId: connId,
            externalAccountId: loc.connections.external_account_id,
            userId: loc.connections.user_id
          })
        }
      }
    })

    // 2. Update locations status
    const results = await Promise.allSettled(
      googleLocationIds.map(googleLocationId =>
        LocationsModel.updateLocationStatusByGoogleId(googleLocationId, status, userId)
      )
    )

    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    logger.debug('Multiple locations status updated', { 
      successful,
      failed,
      total: googleLocationIds.length
    })

    const parallelPostUpdateTasks: Array<Promise<void>> = []

    if (successful > 0 && uniqueConnections.size > 0) {
      parallelPostUpdateTasks.push(
        handlePubSubManagementForConnections(Array.from(uniqueConnections.values()))
      )
    }

    if (status === 'active' && locationsToActivate.length > 0) {
      parallelPostUpdateTasks.push(
        handlePromptContextCreationForLocations(
          locationsToActivate.map(loc => ({
            id: loc.id,
            google_location_id: loc.google_location_id,
            connections: loc.connections
              ? {
                external_account_id: loc.connections.external_account_id
              }
              : null
          })),
          userId
        )
      )
    }

    if (successful > 0 && organizationIds.length > 0) {
      parallelPostUpdateTasks.push(
        handleSubscriptionRecalculationForOrganizations(organizationIds)
      )
    }

    if (parallelPostUpdateTasks.length > 0) {
      await Promise.allSettled(parallelPostUpdateTasks)
    }

    return {
      success: true,
      data: {
        updated: successful,
        failed,
        total: googleLocationIds.length,
        organizationsRecalculated: organizationIds.length
      },
      message: `Updated ${successful} locations successfully`
    }

  } catch (error) {
    logger.error('Error updating multiple locations status', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error updating multiple locations status',
      message: 'Error updating multiple locations status'
    }
  }
}

/**
 * Update multiple locations status by internal IDs (database only)
 * Simple function that only updates the database without additional side effects
 * Used when you need to update status without triggering pubsub, prompt context creation, or subscription recalculation
 */
export async function updateMultipleLocationsStatusByIdsDbOnly(locationIds: string[], status: locations['status'], userId: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    let useOrgValidatedPath = isStaff

    // Validate input parameters
    if (!locationIds || !Array.isArray(locationIds) || locationIds.length === 0) {
      throw new Error('Invalid locationIds: must be a non-empty array')
    }

    if (!status || !['active', 'inactive'].includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be 'active' or 'inactive'`)
    }

    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId: must be a non-empty string')
    }

    const user = await UsersModel.findUserByIdMinimal(userId)
    if (!isStaff && (!user || user.organization_id !== organizationId)) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    // Validate each location ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const uniqueLocationIds = Array.from(new Set(locationIds))
    const invalidIds = uniqueLocationIds.filter(id => !id || typeof id !== 'string' || !uuidRegex.test(id))
    
    if (invalidIds.length > 0) {
      throw new Error(`Invalid location IDs found: ${invalidIds.join(', ')}`)
    }

    if (!isStaff) {
      const allowedLocations = await prisma.locations.findMany({
        where: {
          id: { in: uniqueLocationIds },
          connections: {
            organization_id: organizationId
          }
        },
        select: { id: true }
      })

      if (allowedLocations.length !== uniqueLocationIds.length) {
        return {
          success: false,
          error: 'Unauthorized',
          message: 'Unauthorized organization access'
        }
      }
      useOrgValidatedPath = true
    }

    if (status === 'active') {
      if (useOrgValidatedPath) {
        const result = await LocationsModel.updateManyLocationsStatus(userId, 'active', uniqueLocationIds)
        logger.debug('Updated locations status by IDs (org-validated path)', {
          userId,
          count: result.count,
          total: uniqueLocationIds.length
        })
        return {
          success: true,
          data: { updated: result.count, total: uniqueLocationIds.length },
          message: 'Locations selection synchronized successfully'
        }
      }
      const result = await LocationsModel.syncUserLocationsSelection(userId, uniqueLocationIds)
      logger.debug('Synced user locations selection via updateMultipleLocationsStatusByIdsDbOnly', {
        userId,
        selectedCount: uniqueLocationIds.length,
        activated: result.activated,
        deactivated: result.deactivated
      })
      return {
        success: true,
        data: result,
        message: 'Locations selection synchronized successfully'
      }
    }

    logger.debug('Updating locations status (database only)', {
      locationCount: uniqueLocationIds.length,
      status,
      userId
    })

    // Update locations status (inactive requests keep legacy behavior)
    const result = await LocationsModel.updateManyLocationsStatus(userId, status, uniqueLocationIds)

    logger.debug('Multiple locations status updated by IDs (database only)', { 
      count: result.count,
      total: uniqueLocationIds.length
    })

    return {
      success: true,
      data: {
        updated: result.count,
        total: uniqueLocationIds.length
      },
      message: `Updated ${result.count} locations successfully`
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    logger.error('Error updating multiple locations status by IDs (database only)', {
      error: errorMessage || 'Unknown error',
      stack: errorStack,
      locationIds,
      status,
      userId
    })

    return {
      success: false,
      error: errorMessage || 'Error updating multiple locations status by IDs',
      message: 'Error updating multiple locations status by IDs'
    }
  }
}

/**
 * Update multiple locations status by internal IDs
 * Used during onboarding to activate selected locations
 * Also recalculates subscription location counts for affected organizations
 * Now also manages pubsub subscriptions based on active locations
 */
export async function updateMultipleLocationsStatusByIds(locationIds: string[], status: locations['status'], userId: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    // Validate input parameters
    if (!locationIds || !Array.isArray(locationIds) || locationIds.length === 0) {
      throw new Error('Invalid locationIds: must be a non-empty array')
    }

    if (!status || !['active', 'inactive'].includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be 'active' or 'inactive'`)
    }

    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId: must be a non-empty string')
    }

    const user = await UsersModel.findUserById(userId)
    if (!isStaff && (!user || user.organization_id !== organizationId)) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    // Validate each location ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const invalidIds = locationIds.filter(id => !id || typeof id !== 'string' || !uuidRegex.test(id))
    
    if (invalidIds.length > 0) {
      throw new Error(`Invalid location IDs found: ${invalidIds.join(', ')}`)
    }

    // 1. Get organization IDs and connection info from locations before updating
    // This allows us to know which subscriptions need recalculation and which connections need pubsub management
    // Also get current status to detect inactive -> active transitions
    const locationsWithConnections = await prisma.locations.findMany({
      where: isStaff
        ? { id: { in: locationIds } }
        : {
            id: { in: locationIds },
            connections: {
              organization_id: organizationId
            }
          },
      select: {
        id: true,
        google_location_id: true,
        connection_id: true,
        status: true,
        connections: {
          select: {
            id: true,
            organization_id: true,
            external_account_id: true,
            user_id: true
          }
        }
      }
    })

    if (!isStaff && locationsWithConnections.length !== locationIds.length) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    // Identify locations that are transitioning from inactive to active
    const locationsToActivate = locationsWithConnections.filter(
      loc => loc.status === 'inactive' && status === 'active'
    )

    // Extract unique organization IDs
    const organizationIds = [...new Set(
      locationsWithConnections
        .map(loc => loc.connections?.organization_id)
        .filter((id): id is string => id !== null && id !== undefined)
    )]

    // Extract unique connections (by connection_id) for pubsub management
    const uniqueConnections = new Map<string, {
      connectionId: string
      externalAccountId: string
      userId: string
    }>()
    
    locationsWithConnections.forEach(loc => {
      if (loc.connections) {
        const connId = loc.connection_id
        if (!uniqueConnections.has(connId)) {
          uniqueConnections.set(connId, {
            connectionId: connId,
            externalAccountId: loc.connections.external_account_id,
            userId: loc.connections.user_id
          })
        }
      }
    })

    logger.debug('Updating locations and recalculating subscriptions', {
      locationCount: locationIds.length,
      organizationCount: organizationIds.length,
      connectionCount: uniqueConnections.size,
      organizationIds
    })

    // 2. Update locations status
    const result = await LocationsModel.updateManyLocationsStatus(userId, status, locationIds)

    logger.debug('Multiple locations status updated by IDs', { 
      count: result.count,
      total: locationIds.length
    })

    const parallelPostUpdateTasks: Array<Promise<void>> = []

    if (result.count > 0 && uniqueConnections.size > 0) {
      parallelPostUpdateTasks.push(
        handlePubSubManagementForConnections(Array.from(uniqueConnections.values()))
      )
    }

    if (status === 'active' && locationsToActivate.length > 0) {
      parallelPostUpdateTasks.push(
        handlePromptContextCreationForLocations(
          locationsToActivate.map(loc => ({
            id: loc.id,
            google_location_id: loc.google_location_id,
            connections: loc.connections
              ? {
                external_account_id: loc.connections.external_account_id
              }
              : null
          })),
          userId
        )
      )
    }

    if (result.count > 0 && organizationIds.length > 0) {
      parallelPostUpdateTasks.push(
        handleSubscriptionRecalculationForOrganizations(organizationIds)
      )
    }

    if (parallelPostUpdateTasks.length > 0) {
      await Promise.allSettled(parallelPostUpdateTasks)
    }

    return {
      success: true,
      data: {
        updated: result.count,
        total: locationIds.length,
        organizationsRecalculated: organizationIds.length
      },
      message: `Updated ${result.count} locations successfully`
    }

  } catch (error) {
    logger.error('Error updating multiple locations status by IDs', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      locationIds,
      status,
      userId 
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error updating multiple locations status by IDs',
      message: 'Error updating multiple locations status by IDs'
    }
  }
}

/**
 * Updates multiple locations status by internal IDs using database user id only (no Clerk session).
 * For use from tool/conversation flows (e.g. WhatsApp) where there is no browser session.
 * Same side effects as updateMultipleLocationsStatusByIds: pubsub, prompt context creation, subscription recalc.
 */
export async function updateMultipleLocationsStatusByIdsForUser(
  locationIds: string[],
  status: locations['status'],
  userId: string
) {
  try {
    if (!locationIds || !Array.isArray(locationIds) || locationIds.length === 0) {
      throw new Error('Invalid locationIds: must be a non-empty array')
    }

    if (!status || !['active', 'inactive'].includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be 'active' or 'inactive'`)
    }

    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId: must be a non-empty string')
    }

    const user = await UsersModel.findUserById(userId)
    if (!user?.organization_id) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'User or organization not found'
      }
    }

    const organizationId = user.organization_id

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const invalidIds = locationIds.filter(id => !id || typeof id !== 'string' || !uuidRegex.test(id))
    if (invalidIds.length > 0) {
      throw new Error(`Invalid location IDs found: ${invalidIds.join(', ')}`)
    }

    const locationsWithConnections = await prisma.locations.findMany({
      where: {
        id: { in: locationIds },
        connections: {
          organization_id: organizationId
        }
      },
      select: {
        id: true,
        google_location_id: true,
        connection_id: true,
        status: true,
        connections: {
          select: {
            id: true,
            organization_id: true,
            external_account_id: true,
            user_id: true
          }
        }
      }
    })

    if (locationsWithConnections.length !== locationIds.length) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    const locationsToActivate = locationsWithConnections.filter(
      loc => loc.status === 'inactive' && status === 'active'
    )

    const organizationIds = [...new Set(
      locationsWithConnections
        .map(loc => loc.connections?.organization_id)
        .filter((id): id is string => id !== null && id !== undefined)
    )]

    const uniqueConnections = new Map<string, {
      connectionId: string
      externalAccountId: string
      userId: string
    }>()
    locationsWithConnections.forEach(loc => {
      if (loc.connections) {
        const connId = loc.connection_id
        if (!uniqueConnections.has(connId)) {
          uniqueConnections.set(connId, {
            connectionId: connId,
            externalAccountId: loc.connections.external_account_id,
            userId: loc.connections.user_id
          })
        }
      }
    })

    logger.debug('Updating locations status (for-user path)', {
      locationCount: locationIds.length,
      organizationCount: organizationIds.length,
      connectionCount: uniqueConnections.size,
      userId
    })

    const result = await LocationsModel.updateManyLocationsStatus(userId, status, locationIds)

    logger.debug('Multiple locations status updated by IDs (for-user)', {
      count: result.count,
      total: locationIds.length
    })

    const parallelPostUpdateTasks: Array<Promise<void>> = []

    if (result.count > 0 && uniqueConnections.size > 0) {
      parallelPostUpdateTasks.push(
        handlePubSubManagementForConnections(Array.from(uniqueConnections.values()))
      )
    }

    if (status === 'active' && locationsToActivate.length > 0) {
      parallelPostUpdateTasks.push(
        handlePromptContextCreationForLocations(
          locationsToActivate.map(loc => ({
            id: loc.id,
            google_location_id: loc.google_location_id,
            connections: loc.connections
              ? { external_account_id: loc.connections.external_account_id }
              : null
          })),
          userId
        )
      )
    }

    if (result.count > 0 && organizationIds.length > 0) {
      parallelPostUpdateTasks.push(
        handleSubscriptionRecalculationForOrganizationsInternal(organizationIds)
      )
    }

    if (parallelPostUpdateTasks.length > 0) {
      await Promise.allSettled(parallelPostUpdateTasks)
    }

    return {
      success: true,
      data: {
        updated: result.count,
        total: locationIds.length,
        organizationsRecalculated: organizationIds.length
      },
      message: `Updated ${result.count} locations successfully`
    }
  } catch (error) {
    logger.error('Error updating multiple locations status by IDs (for-user)', {
      error: error instanceof Error ? error.message : 'Unknown error',
      locationIds,
      status,
      userId
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error updating multiple locations status by IDs',
      message: 'Error updating multiple locations status by IDs'
    }
  }
}