/**
 * GMB Locations Actions - Server Actions for Google My Business Locations
 * 
 * This file contains server actions for handling operations related to
 * Google My Business locations. Includes functions to fetch, sync and
 * persist locations with their associated opening hours.
 * 
 * Main functionalities:
 * - Get Google My Business locations by user
 * - Sync locations with local database
 * - Create locations with opening hours without checking if they exist
 * - Calculate data completeness analytics
 * - End-to-end orchestration of the entire process
 */

'use server'

import { GmbLocationsModel, type GoogleBusinessLocationWithConnection } from '../../models/gmb/locations.model'
import { LocationsModel } from '../../models/supabase/locations.model'
import { upsertLocationWithHours } from '../supabase/locations.action'
import { UsersModel } from '../../models/supabase/users.model'
import { ConnectionsModel } from '../../models/supabase/connections.model'
import { formatGoogleTimeToString, isValidGoogleOpeningPeriod } from '../../../lib/api-helpers'
import type { locations, opening_hours, users } from '../../../app/generated/prisma'
import { Prisma } from '../../../app/generated/prisma'
import { createLogger } from '@/lib/logger'
import { getAuthenticatedDatabaseUserId, requireServerActionUser } from '@/lib/server-action-auth'

const logger = createLogger('GMB-LOCATIONS')

async function isAuthenticatedClerkUser(clerkUserId: string): Promise<boolean> {
  const { clerkUserId: authenticatedClerkUserId } = await requireServerActionUser()
  return authenticatedClerkUserId === clerkUserId
}

async function isAuthenticatedUserId(userId: string): Promise<boolean> {
  const { dbUserId } = await getAuthenticatedDatabaseUserId()
  return dbUserId === userId
}

export interface ProcessLocationsResult {
  locations: GoogleBusinessLocationWithConnection[]
  savedLocations: locations[]
  totalLocations: number
  connections: {
    total: number
    processed: Array<{ id: string; external_account_id: string; created_at: Date | null }>
  }
  analytics: {
    locationsWithWebsite: number
    locationsWithPhone: number
    locationsWithHours: number
    locationsWithAddress: number
    locationsWithCoordinates: number
    completenessScore: number
  }
  apiInfo: {
    version: string
    endpoint: string
    fieldsExtracted: number
  }
  message: string
}

export interface SyncLocationsResult {
  savedLocations: locations[]
  totalProcessed: number
  errors: number
  analytics: {
    locationsWithWebsite: number
    locationsWithPhone: number
    locationsWithHours: number
    locationsWithAddress: number
    locationsWithCoordinates: number
    completenessScore: number
  }
}

/**
 * Helper function to get user and their connections
 */
async function getUserAndConnections(clerkUserId: string) {
  const dbUser = await UsersModel.findUserByClerkId(clerkUserId)
  if (!dbUser) {
    throw new Error('User not found in database')
  }

  const connections = await ConnectionsModel.findUserConnections(dbUser.id)
  if (connections.length === 0) {
    throw new Error('No Google connections found. First run the accounts API.')
  }

  return { dbUser, connections }
}

/**
 * Process and persist locations in batches with concurrency control
 */
async function persistLocationsBatch(
  allLocations: GoogleBusinessLocationWithConnection[],
  dbUser: { id: string },
  concurrency = 5
): Promise<locations[]> {
  const savedLocations: locations[] = []

  // Map Google days to database days
  const dayMapping: Record<string, opening_hours['weekday']> = {
    MONDAY: 'monday',
    TUESDAY: 'tuesday',
    WEDNESDAY: 'wednesday',
    THURSDAY: 'thursday',
    FRIDAY: 'friday',
    SATURDAY: 'saturday',
    SUNDAY: 'sunday'
  }

  // Worker that processes a single location (upsert + replace hours)
  async function processLocation(location: GoogleBusinessLocationWithConnection): Promise<locations | null> {
    try {
      const googleLocationId = location.name
      const addressLines = location.storefrontAddress?.addressLines || []
      const primaryPhone = location.phoneNumbers?.primaryPhone ?? null
      const latitude = location.latlng?.latitude ?? null
      const longitude = location.latlng?.longitude ?? null
      const primaryCategory = location.categories?.primaryCategory?.name ?? null

      const locationData = {
        connection_id: location.connectionId!,
        google_location_id: googleLocationId,
        name: location.title ?? null,
        address_line1: addressLines[0] ?? null,
        address_line2: addressLines[1] ?? null,
        city: location.storefrontAddress?.locality ?? null,
        postal_code: location.storefrontAddress?.postalCode ?? null,
        region: location.storefrontAddress?.administrativeArea ?? null,
        country: location.storefrontAddress?.regionCode ?? null,
        primary_category: primaryCategory,
        website: location.websiteUri ?? null,
        lat: latitude ? new Prisma.Decimal(Number(latitude)) : null,
        lng: longitude ? new Prisma.Decimal(Number(longitude)) : null,
        phone: primaryPhone,
        verified: true,
        updated_by: dbUser.id,
        reviews_processed: 0,
      }

      // Prepare valid opening hours
      const validHours: Omit<opening_hours, 'location_id'>[] = []
      if (location.regularHours?.periods && location.regularHours.periods.length > 0) {
        for (const period of location.regularHours.periods) {
          if (!isValidGoogleOpeningPeriod(period)) {
            continue
          }

          // Use openDay or closeDay (whichever is present)
          const weekdayKey = (period.openDay ?? period.closeDay ?? '').toUpperCase()
          const weekday = dayMapping[weekdayKey]
          if (!weekday) continue

          // Format times - allow null if not present
          const openTimeString = period.openTime ? formatGoogleTimeToString(period.openTime) : null
          const closeTimeString = period.closeTime ? formatGoogleTimeToString(period.closeTime) : null
          
          // At least one time must be present
          if (!openTimeString && !closeTimeString) {
            logger.debug('Invalid time - skipping period (no valid times)', {
              googleLocationId,
              rawOpen: period.openTime,
              rawClose: period.closeTime
            })
            continue
          }

          validHours.push({
            id: '', // Will be generated by database
            weekday,
            open_time: openTimeString, // Can be null if only closeTime is present
            close_time: closeTimeString, // Can be null if only openTime is present
            created_at: null,
            updated_at: null
          })
        }
      }

      // Execute transaction: upsert location + replace hours
      const result = await upsertLocationWithHours(
        googleLocationId,
        locationData,
        validHours,
        dbUser.id
      )

      if (!result.success || !result.data) {
        logger.error('Error upserting location', { googleLocationId, error: result.error })
        return null
      }

      logger.debug('Location persisted (upsert)', { locationId: result.data.id, googleLocationId })
      return result.data
    } catch (err) {
      logger.error('Error persisting location', err)
      return null
    }
  }

  // Process in parallel batches to control concurrency
  for (let i = 0; i < allLocations.length; i += concurrency) {
    const batch = allLocations.slice(i, i + concurrency)
    const results = await Promise.all(batch.map(loc => processLocation(loc)))
    for (const r of results) {
      if (r) savedLocations.push(r)
    }
  }

  return savedLocations
}

/**
 * Calculate data completeness analytics for locations
 */
function calculateAnalytics(allLocations: GoogleBusinessLocationWithConnection[]) {
  const locationsWithWebsite = allLocations.filter(l => l.websiteUri).length
  const locationsWithPhone = allLocations.filter(l => l.phoneNumbers?.primaryPhone).length
  const locationsWithHours = allLocations.filter(l => l.regularHours?.periods?.length).length
  const locationsWithAddress = allLocations.filter(l => l.storefrontAddress?.addressLines?.length).length
  const locationsWithCoordinates = allLocations.filter(l => l.latlng?.latitude && l.latlng?.longitude).length

  return {
    locationsWithWebsite,
    locationsWithPhone,
    locationsWithHours,
    locationsWithAddress,
    locationsWithCoordinates,
    completenessScore: allLocations.length > 0 ? 
      Math.round(((locationsWithWebsite + locationsWithPhone + locationsWithHours + locationsWithAddress + locationsWithCoordinates) / (allLocations.length * 5)) * 100) : 0
  }
}

/**
 * Server action to process Google My Business locations
 * @param accessToken - Google access token
 * @param clerkUserId - User ID in Clerk
 * @param concurrency - Concurrency level for processing (default: 5)
 * @returns Location processing result
 */
export async function processGoogleLocations(
  accessToken: string,
  clerkUserId: string,
  concurrency = 5
): Promise<ProcessLocationsResult> {
  try {
    const isAuthorized = await isAuthenticatedClerkUser(clerkUserId)
    if (!isAuthorized) {
      return {
        locations: [],
        savedLocations: [],
        totalLocations: 0,
        connections: {
          total: 0,
          processed: []
        },
        analytics: {
          locationsWithWebsite: 0,
          locationsWithPhone: 0,
          locationsWithHours: 0,
          locationsWithAddress: 0,
          locationsWithCoordinates: 0,
          completenessScore: 0
        },
        apiInfo: {
          version: 'Business Information API v1',
          endpoint: 'mybusinessbusinessinformation.googleapis.com',
          fieldsExtracted: GmbLocationsModel.readMaskFields.length
        },
        message: 'Unauthorized user access'
      }
    }

    logger.start('Processing Google locations for user', { userId: clerkUserId })
    
    // Get user and connections
    const { dbUser, connections } = await getUserAndConnections(clerkUserId)
    
    // Get locations for all connections
    logger.debug('Fetching locations using Business Information API v1')
    const allLocations: GoogleBusinessLocationWithConnection[] = []
    
    for (const connection of connections) {
      try {
        const connectionLocations = await GmbLocationsModel.fetchLocationsForConnection(connection, accessToken)
        allLocations.push(...connectionLocations)
        logger.debug(`Locations fetched for connection ${connection.external_account_id}`, { count: connectionLocations.length })
      } catch (error) {
        logger.error(`Error fetching locations for connection ${connection.external_account_id}`, error)
      }
    }
    
    logger.info('Total locations found', { total: allLocations.length })
    
    if (allLocations.length === 0) {
      return {
        locations: [],
        savedLocations: [],
        totalLocations: 0,
        connections: {
          total: connections.length,
          processed: connections.map(c => ({ id: c.id, external_account_id: c.external_account_id, created_at: c.created_at }))
        },
        analytics: {
          locationsWithWebsite: 0,
          locationsWithPhone: 0,
          locationsWithHours: 0,
          locationsWithAddress: 0,
          locationsWithCoordinates: 0,
          completenessScore: 0
        },
        apiInfo: {
          version: 'Business Information API v1',
          endpoint: 'mybusinessbusinessinformation.googleapis.com',
          fieldsExtracted: GmbLocationsModel.readMaskFields.length
        },
        message: 'No Google My Business locations found'
      }
    }

    // Persist locations in batches
    const savedLocations = await persistLocationsBatch(allLocations, dbUser, concurrency)
    logger.debug('Persistence process completed:', { saved: savedLocations.length })

    // Calculate analytics
    const analytics = calculateAnalytics(allLocations)

    return {
      locations: allLocations,
      savedLocations,
      totalLocations: allLocations.length,
      connections: {
        total: connections.length,
        processed: connections.map(c => ({ id: c.id, external_account_id: c.external_account_id, created_at: c.created_at }))
      },
      analytics,
      apiInfo: {
        version: 'Business Information API v1',
        endpoint: 'mybusinessbusinessinformation.googleapis.com',
        fieldsExtracted: GmbLocationsModel.readMaskFields.length
      },
      message: `Processed ${allLocations.length} locations. ${savedLocations.length} locations saved to database.`
    }

  } catch (error) {
    logger.error('Error in processGoogleLocations server action:', error)
    
    return {
      locations: [],
      savedLocations: [],
      totalLocations: 0,
      connections: {
        total: 0,
        processed: []
      },
      analytics: {
        locationsWithWebsite: 0,
        locationsWithPhone: 0,
        locationsWithHours: 0,
        locationsWithAddress: 0,
        locationsWithCoordinates: 0,
        completenessScore: 0
      },
      apiInfo: {
        version: 'Business Information API v1',
        endpoint: 'mybusinessbusinessinformation.googleapis.com',
        fieldsExtracted: GmbLocationsModel.readMaskFields.length
      },
      message: error instanceof Error ? error.message : 'Unknown error processing locations'
    }
  }
}

/**
 * Server action to get saved locations for a user
 * @param clerkUserId - User ID in Clerk
 * @returns User's saved locations
 */
export async function getUserLocations(clerkUserId: string): Promise<{ locations: locations[]; totalLocations: number }> {
  try {
    const isAuthorized = await isAuthenticatedClerkUser(clerkUserId)
    if (!isAuthorized) {
      return {
        locations: [],
        totalLocations: 0
      }
    }

    logger.debug('Getting user locations for', { userId: clerkUserId })
    
    const dbUser = await UsersModel.findUserByClerkId(clerkUserId)
    if (!dbUser) {
      throw new Error('User not found in database')
    }

    const locations = await LocationsModel.findByUserId(dbUser.id)
    
    return {
      locations,
      totalLocations: locations.length
    }
  } catch (error) {
    logger.error('Error in getUserLocations server action:', error)
    
    return {
      locations: [],
      totalLocations: 0
    }
  }
}

/**
 * Server action to fetch Google My Business locations directly
 * @param accessToken - Google access token
 * @param clerkUserId - User ID in Clerk
 * @returns Google My Business locations
 */
export async function fetchGoogleLocations(
  accessToken: string,
  clerkUserId: string
): Promise<{ locations: GoogleBusinessLocationWithConnection[]; totalLocations: number }> {
  try {
    const isAuthorized = await isAuthenticatedClerkUser(clerkUserId)
    if (!isAuthorized) {
      return {
        locations: [],
        totalLocations: 0
      }
    }

    logger.debug('Fetching Google locations directly')
    
    const { connections } = await getUserAndConnections(clerkUserId)
    const allLocations: GoogleBusinessLocationWithConnection[] = []
    
    for (const connection of connections) {
      const connectionLocations = await GmbLocationsModel.fetchLocationsForConnection(connection, accessToken)
      allLocations.push(...connectionLocations)
    }
    
    return {
      locations: allLocations,
      totalLocations: allLocations.length
    }
  } catch (error) {
    logger.error('Error in fetchGoogleLocations server action:', error)
    
    return {
      locations: [],
      totalLocations: 0
    }
  }
}

export async function syncGoogleLocationsToLocations({
  locations,
  dbUser
}: {
  locations: GoogleBusinessLocationWithConnection[]
  dbUser: users
}): Promise<SyncLocationsResult> {
  if (!Array.isArray(locations) || locations.length === 0) {
    logger.debug('No locations to sync')
    return {
      savedLocations: [],
      totalProcessed: 0,
      errors: 0,
      analytics: {
        locationsWithWebsite: 0,
        locationsWithPhone: 0,
        locationsWithHours: 0,
        locationsWithAddress: 0,
        locationsWithCoordinates: 0,
        completenessScore: 0
      }
    }
  }

  try {
    // Create all locations with their opening hours without checking if they exist
    const savedLocations = await LocationsModel.upsertManyLocationsWithHours(dbUser.id, locations.map(item => {
      const addressLines = item.storefrontAddress?.addressLines || []
      const primaryPhone = item.phoneNumbers?.primaryPhone ?? null
      const latitude = item.latlng?.latitude ?? null
      const longitude = item.latlng?.longitude ?? null
      const primaryCategory = item.categories?.primaryCategory?.name ?? null

      const locationData = {
        connection_id: item.connectionId!,
        google_location_id: item.name,
        name: item.title ?? null,
        address_line1: addressLines[0] ?? null,
        address_line2: addressLines[1] ?? null,
        city: item.storefrontAddress?.locality ?? null,
        postal_code: item.storefrontAddress?.postalCode ?? null,
        region: item.storefrontAddress?.administrativeArea ?? null,
        country: item.storefrontAddress?.regionCode ?? null,
        primary_category: primaryCategory,
        website: item.websiteUri ?? null,
        lat: latitude ? new Prisma.Decimal(Number(latitude)) : null,
        lng: longitude ? new Prisma.Decimal(Number(longitude)) : null,
        phone: primaryPhone,
        verified: true,
        updated_by: dbUser.id,
        reviews_processed: 0,
      }

      // Map Google days to database days
      const dayMapping: Record<string, opening_hours['weekday']> = {
        MONDAY: 'monday',
        TUESDAY: 'tuesday',
        WEDNESDAY: 'wednesday',
        THURSDAY: 'thursday',
        FRIDAY: 'friday',
        SATURDAY: 'saturday',
        SUNDAY: 'sunday'
      }

      // Prepare valid opening hours
      const validHours: Omit<opening_hours, 'location_id'>[] = []
      if (item.regularHours?.periods && item.regularHours.periods.length > 0) {
        for (const period of item.regularHours.periods) {
          if (!isValidGoogleOpeningPeriod(period)) {
            continue
          }

          // Use openDay or closeDay (whichever is present)
          const weekdayKey = (period.openDay ?? period.closeDay ?? '').toUpperCase()
          const weekday = dayMapping[weekdayKey]
          if (!weekday) continue

          // Format times - allow null if not present
          const openTimeString = period.openTime ? formatGoogleTimeToString(period.openTime) : null
          const closeTimeString = period.closeTime ? formatGoogleTimeToString(period.closeTime) : null
          
          // At least one time must be present
          if (!openTimeString && !closeTimeString) {
            continue
          }

          validHours.push({
            id: '', // Will be generated by database
            weekday,
            open_time: openTimeString, // Can be null if only closeTime is present
            close_time: closeTimeString, // Can be null if only openTime is present
            created_at: null,
            updated_at: null
          })
        }
      }

      return {
        googleLocationId: item.name,
        locationData,
        validHours,
        userId: dbUser.id
      }
    }))

    return {
      savedLocations,
      totalProcessed: savedLocations.length,
      errors: 0,
      analytics: calculateAnalytics(locations)
    }
  } catch (error) {
    logger.error('Error in syncGoogleLocationsToLocations server action:', error)
    return {
      savedLocations: [],
      totalProcessed: 0,
      errors: 1,
      analytics: calculateAnalytics(locations)
    }
  }

}