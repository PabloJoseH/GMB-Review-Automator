/**
 * Locations Model - Supabase Database Operations
 * 
 * This model handles all database operations related to Google My Business locations.
 * It includes functions for creating, updating, retrieving, and synchronizing
 * locations along with their associated opening hours.
 * 
 * Main functionalities:
 * - Upsert locations with opening hours
 * - Retrieve locations filtered by user and criteria
 * - Manage opening hours
 * - Transactional operations to maintain data consistency
 */

import { prisma } from '../../../lib/prisma'
import type { connections, locations, opening_hours, Prisma, prompt_context, users } from '../../../app/generated/prisma'
import { APP_CONSTANTS } from '@/lib/constants'
import { createLogger } from '@/lib/logger'

const logger = createLogger('LocationsModel')

interface LocationWithConnection extends locations {
  connections: connections
}

export interface LocationWithConnectionUserAndPromptContext extends LocationWithConnection {
  user: users
  prompt_context: prompt_context
}


export const LocationsModel = {

  /**
   * Finds all active locations that belong to organizations with active or trialing subscriptions
   * This is used to determine which locations should receive review notifications and processing
   * 
   * @returns Array of active locations with their connections and associated users
   */
  findActiveLocationsWithActiveSubscriptions: async (): Promise<LocationWithConnectionUserAndPromptContext[]> => {
      const locations = await prisma.locations.findMany({
        where: {
          status: 'active', // Only active locations
          connections: {
            organizations: {
              subscriptions: {
                status: {
                  in: ['active', 'trialing'] // Include both active and trialing subscriptions
                }
              }
            }
          }
        },
        include: {
          connections: true, // Include connection details
          users_locations_created_byTousers: true, // Include user who created the location
          prompt_context: true
        }
      })

      // Transform the result to match the expected interface
      // Filter out locations without a user (in case created_by is null)
      return locations
        .filter(loc => loc.users_locations_created_byTousers !== null)
        .map(loc => ({
          ...loc,
          user: loc.users_locations_created_byTousers as users
        })) as LocationWithConnectionUserAndPromptContext[]
    
  },

  /**
   * Finds all active locations that belong to organizations with canceled or paused subscriptions
   * These locations should have their notifications deleted from Pub/Sub
   * 
   * @returns Array of active locations with canceled or paused subscriptions
   */
  findActiveLocationsWithCanceledOrPausedSubscriptions: async (): Promise<LocationWithConnectionUserAndPromptContext[]> => {
      const locations = await prisma.locations.findMany({
        where: {
          status: 'active', // Only active locations
          connections: {
            organizations: {
              subscriptions: {
                status: {
                  in: ['canceled', 'paused'] // Only canceled or paused subscriptions
                }
              }
            }
          }
        },
        include: {
          connections: true, // Include connection details
          users_locations_created_byTousers: true, // Include user who created the location
          prompt_context: true
        }
      })

      // Transform the result to match the expected interface
      // Filter out locations without a user (in case created_by is null)
      return locations
        .filter(loc => loc.users_locations_created_byTousers !== null)
        .map(loc => ({
          ...loc,
          user: loc.users_locations_created_byTousers as users
        })) as LocationWithConnectionUserAndPromptContext[]
    
  },

  findActiveLocations: async (userId: string): Promise<LocationWithConnection[]> => {
    return await prisma.locations.findMany({
      where: {
        created_by: userId,
        status: 'active'
      },
      include: {
        connections: true
      }
    })
  },

  /**
   * Find active locations by user ID with prompt context
   * @param userId - User ID to find locations for
   * @returns Array of active locations with prompt context
   */
  findActiveLocationsWithPromptContext: async (userId: string): Promise<Array<locations & { prompt_context: prompt_context | null }>> => {
    return await prisma.locations.findMany({
      where: {
        created_by: userId,
        status: 'active'
      },
      include: {
        connections: true,
        prompt_context: true
      }
    })
  },

  /**
   * Find active locations by organization ID with prompt context
   * @param organizationId - Organization ID to find locations for
   * @returns Array of active locations with prompt context
   */
  findActiveLocationsByOrganizationIdWithPromptContext: async (organizationId: string): Promise<Array<locations & { prompt_context: prompt_context | null }>> => {
    return await prisma.locations.findMany({
      where: {
        status: 'active',
        connections: {
          organization_id: organizationId
        }
      },
      include: {
        connections: true,
        prompt_context: true
      },
      take: 1000
    })
  },

  /**
   * Finds locations filtered by specific criteria
   * @param whereClause - Filtering criteria for the search
   * @returns Array of locations that match the criteria
   */
  findFilteredLocations: async (whereClause: Prisma.locationsWhereInput, take: number = APP_CONSTANTS.database.pagination.defaultPageSize): Promise<locations[]> => {
    return await prisma.locations.findMany({
      where: whereClause,
      include: {
        connections: true,
        opening_hours: true
      },
      orderBy: {
        created_at: 'desc'
      },
      take: take // Limit to avoid timeouts
    })
  },

  /**
   * Find many locations with relations
   */
  findManyWithRelations: async (
    where: Prisma.locationsWhereInput,
    sortBy: string = 'created_at',
    sortOrder: 'asc' | 'desc' = 'desc',
    offset: number = 0,
    limit: number = APP_CONSTANTS.database.batch.defaultLimit,
    includeCount: boolean = false
  ) => {
    if (includeCount) {
      const [locations, totalCount] = await Promise.all([
        prisma.locations.findMany({
          where,
          include: {
            connections: {
              include: {
                organizations: {
                  include: {
                    subscriptions: true
                  }
                }
              }
            },
            opening_hours: true
          },
          orderBy: {
            [sortBy]: sortOrder
          },
          skip: offset,
          take: limit
        }),
        prisma.locations.count({ where })
      ])
      return { locations: locations || [] as locations[], totalCount: totalCount as number }
    }
    return prisma.locations.findMany({
      where,
      include: {
        connections: {
          include: {
            organizations: {
              include: {
                subscriptions: true
              }
            }
          }
        },
        opening_hours: true
      },
      orderBy: {
        [sortBy]: sortOrder
      },
      skip: offset,
      take: limit
    })
  },

  /**
   * Find location by ID
   * @param id - The location ID
   * @returns The location with its connections
   */
  findById: async (id: string): Promise<locations & { connections: connections } | null> => {
    return await prisma.locations.findUnique({
      where: { id },
      include: {
        connections: true
      }
    })
  },

  /**
   * Finds a location ID by its reference ensuring the location belongs to the provided user.
   * @param reference - Location reference number
   * @param userId - Authenticated user ID
   * @returns Location ID when found, otherwise null
   */
  findLocationIdByReferenceForUser: async (reference: number, userId: string): Promise<string | null> => {
    const location = await prisma.locations.findFirst({
      where: {
        reference,
        created_by: userId
      },
      select: {
        id: true
      }
    })

    return location?.id ?? null
  },

  /**
   * Finds a location with its connections by reference ensuring user ownership.
   * @param reference - Location reference number
   * @param userId - Authenticated user ID
   * @returns Location with connections or null
   */
  findByReferenceWithConnectionsForUser: async (
    reference: number,
    userId: string
  ): Promise<(locations & { connections: connections }) | null> => {
    return await prisma.locations.findFirst({
      where: {
        reference,
        created_by: userId
      },
      include: {
        connections: true
      }
    })
  },

  /**
   * Finds a location with its prompt context by reference ensuring user ownership.
   * @param reference - Location reference number
   * @param userId - Authenticated user ID
   * @returns Location with prompt context or null
   */
  findByReferenceWithPromptContextForUser: async (
    reference: number,
    userId: string
  ): Promise<(locations & { prompt_context: prompt_context | null }) | null> => {
    return await prisma.locations.findFirst({
      where: {
        reference,
        created_by: userId
      },
      include: {
        prompt_context: true
      }
    })
  },

  /**
   * Find locations by IDs with selectable fields
   * @param ids - Array of location IDs
   * @param select - Prisma select object to specify which fields to return
   * @returns Array of locations with selected fields
   */
  findByIds: async <T extends Prisma.locationsSelect>(
    ids: string[],
    select?: T
  ): Promise<Array<Prisma.locationsGetPayload<{ select: T }>>> => {
    if (ids.length === 0) return [];
    
    return await prisma.locations.findMany({
      where: {
        id: { in: ids }
      },
      select: select as T
    }) as Array<Prisma.locationsGetPayload<{ select: T }>>
  },

  /**
   * Find location by ID with full relations
   * Used in: location detail pages
   * 
   * Note: example_reviews are excluded here as they are fetched separately
   * with pagination in ExampleReviewsTableServer to avoid loading all reviews.
   */
  findByIdWithRelations: async (id: string) => {
    return await prisma.locations.findUnique({
      where: { id },
      include: {
        connections: {
          include: {
            organizations: {
              include: {
                subscriptions: true
              }
            }
          }
        },
        opening_hours: {
          orderBy: {
            weekday: 'asc'
          }
        },
        prompt_context: true,
        users_locations_created_byTousers: {
          select: {
            id: true,
            name: true,
            lastname: true,
            email: true
          }
        },
        users_locations_updated_byTousers: {
          select: {
            id: true,
            name: true,
            lastname: true,
            email: true
          }
        },
        _count: {
          select: {
            example_reviews: true
          }
        }
      }
    })
  },

  /**
   * Finds a location by its Google Location ID
   * @param googleLocationId - Google Location ID
   * @returns The location found or null
   */
  findByGoogleId: async (googleLocationId: string): Promise<locations | null> => {
    return await prisma.locations.findFirst({
      where: { google_location_id: googleLocationId },
      include: {
        connections: true,
        opening_hours: true
      }
    })
  },

  /**
   * Finds locations by user ID
   * @param userId - ID of the owner user
   * @returns Array of user's locations
   */
  findByUserId: async (userId: string): Promise<locations[]> => {
    return await prisma.locations.findMany({
      where: { 
        created_by: userId,
      },
      include: {
        connections: true,
        opening_hours: true
      },
      orderBy: {
        created_at: 'desc'
      }
    })
  },

  /**
   * Create location
   * Always creates with status = 'inactive'
   * Status is excluded from input and forced to 'inactive'
   */
  createLocation: async (locationData: Omit<locations, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'status'>): Promise<locations> => {
    return await prisma.locations.create({
      data: {
        ...locationData,
        status: 'inactive' // Explicitly set to inactive
      }
    })
  },

  createManyLocations: async (locationData: Omit<locations, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'status'>[]): Promise<Prisma.BatchPayload> => {
    return await prisma.locations.createMany({
      data: locationData.map(location => ({
        ...location,
        
        status: 'inactive'
      }))
    })
  },

  /**
   * Update location
   * Status cannot be updated via this function - it's explicitly excluded
   */
  updateLocation: async (id: string, locationData: Omit<locations, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'status'>): Promise<locations> => {
    // Status is already excluded from the type, so it's safe to use directly
    return await prisma.locations.update({
      where: { id },
      data: locationData // Status is never included due to type exclusion
    })
  },

  updateManyLocations: async (userId: string, data: { id: string, locationData: Omit<locations, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'status'>}[]): Promise<Prisma.BatchPayload> => {
    return await prisma.locations.updateMany({
      data: data.map(item => ({
        ...item.locationData,
        id: item.id,
        created_by: userId
      })),
      where: { id: { in: data.map(item => item.id) } }
    })
  },

  /**
   * Upserts locations with opening hours by (connection_id, google_location_id).
   * Updates existing locations, creates new ones. Prevents duplicates when sync runs multiple times.
   */
  upsertManyLocationsWithHours: async (userId: string, data: {googleLocationId: string, locationData: Omit<locations, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'status' | 'reference'>, validHours: Omit<opening_hours, 'location_id'>[], userId: string}[]): Promise<locations[]> => {
    return await prisma.$transaction(async (tx) => {
      logger.debug('Upserting locations and opening hours', {
        locationsCount: data.length,
        openingHoursCount: data.reduce((acc, item) => acc + item.validHours.length, 0)
      })

      const results: locations[] = []

      for (const item of data) {
        const { connection_id, ...restLocationData } = item.locationData

        if (!connection_id || typeof connection_id !== 'string') {
          logger.warn('Skipping location with invalid connection_id', { googleLocationId: item.googleLocationId })
          continue
        }

        const existingLocation = await tx.locations.findFirst({
          where: {
            connection_id,
            google_location_id: item.googleLocationId
          }
        })

        let location: locations

        if (existingLocation) {
          location = await tx.locations.update({
            where: { id: existingLocation.id },
            data: {
              ...restLocationData,
              connection_id,
              updated_at: new Date(),
              updated_by: userId
            }
          })
        } else {
          location = await tx.locations.create({
            data: {
              ...restLocationData,
              connection_id,
              google_location_id: item.googleLocationId,
              created_by: userId,
              status: 'inactive'
            }
          })
        }

        await tx.opening_hours.deleteMany({
          where: { location_id: location.id }
        })

        if (item.validHours.length > 0) {
          await tx.opening_hours.createMany({
            data: item.validHours.map(hour => ({
              location_id: location.id,
              weekday: hour.weekday,
              open_time: hour.open_time,
              close_time: hour.close_time
            }))
          })
        }

        results.push(location)
      }

      return results
    })
  },

  /**
   * Upserts a location along with its opening hours
   * Since google_location_id is not unique, this uses findFirst to check for existing location
   * @param googleLocationId - Google Location ID
   * @param locationData - Location data to create/update (without auto-generated fields)
   * @param validHours - Valid opening hours
   * @param userId - Owner user ID
   * @returns The created or updated location
   */
  upsertLocationWithHours: async (
    googleLocationId: string,
    locationData: Omit<locations, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'status' | 'reference'>,
    validHours: Omit<opening_hours, 'location_id'>[],
    userId: string
  ): Promise<locations> => {
    return await prisma.$transaction(async (tx) => {
      // Check if location exists by google_location_id
      const { connection_id, ...restLocationData } = locationData

      if (!connection_id || typeof connection_id !== 'string') {
        throw new Error('connection_id is required and must be a string to create a location')
      }

      // Find existing location by google_location_id
      const existingLocation = await tx.locations.findFirst({
        where: { google_location_id: googleLocationId }
      })

      let location: locations

      if (existingLocation) {
        // Update existing location
        location = await tx.locations.update({
          where: { id: existingLocation.id },
          data: {
            ...restLocationData,
            ...(typeof locationData.connection_id === 'string' ? { connection_id: locationData.connection_id } : {}),
            updated_at: new Date(),
            updated_by: userId
            // Status is explicitly excluded from update - it can only be changed via dedicated status update functions
            // The type Omit<locations, ..., 'status'> ensures status is not included in restLocationData
          }
        })
      } else {
        // Create new location
        location = await tx.locations.create({
          data: {
            ...restLocationData,
            connection_id,
            google_location_id: googleLocationId,
            created_by: userId,
            status: 'inactive'
          }
        })
      }

      // Delete existing opening hours for this location
      await tx.opening_hours.deleteMany({
        where: { location_id: location.id }
      })

      // Create new opening hours if they exist
      if (validHours.length > 0) {
        await tx.opening_hours.createMany({
          data: validHours.map(hour => ({
            location_id: location.id,
            weekday: hour.weekday,
            open_time: hour.open_time,
            close_time: hour.close_time
          }))
        })
      }
      return location
    })
  },

  /**
   * Delete location
   */
  deleteLocation: async (id: string): Promise<locations> => {
    return await prisma.locations.delete({
      where: { id }
    })
  },

  /**
   * Update location status by Google Location ID
   * Used during onboarding to activate/deactivate locations
   * Since google_location_id is not unique, this updates the first matching location
   */
  updateLocationStatusByGoogleId: async (
    googleLocationId: string, 
    status: locations['status'],
    userId: string
  ): Promise<locations | null> => {
    // Find location by google_location_id first
    const location = await prisma.locations.findFirst({
      where: { google_location_id: googleLocationId }
    })

    if (!location) {
      return null
    }

    // Update the location status
    return await prisma.locations.update({
      where: { id: location.id },
      data: {
        status,
        updated_by: userId,
        updated_at: new Date()
      }
    })
  },
  
  /**
   * Update status for multiple locations by their IDs
   * Used during onboarding to activate/deactivate multiple locations at once
   * @param userId - User ID who is performing the update
   * @param status - New status to set
   * @param ids - Array of location IDs to update
   * @returns BatchPayload with count of locations updated
   */
  updateManyLocationsStatus: async (userId: string, status: locations['status'], ids: string[]): Promise<Prisma.BatchPayload> => {
    return await prisma.locations.updateMany({
      where: { id: { in: ids } },
      data: { status: status as locations['status'], updated_by: userId }
    })
  },

  /**
   * Synchronizes the active/inactive status of all locations created by a user.
   *
   * @param userId - Owner user whose locations should be synced.
   * @param selectedLocationIds - IDs that must remain active after the sync.
   * @returns Counts of activated and deactivated rows along with the total selectable locations.
   */
  syncUserLocationsSelection: async (
    userId: string,
    selectedLocationIds: string[]
  ): Promise<{ activated: number; deactivated: number; totalSelectable: number }> => {
    return await prisma.$transaction(async (tx) => {
      const userLocations = await tx.locations.findMany({
        where: { created_by: userId },
        select: {
          id: true,
          status: true
        }
      })

      if (userLocations.length === 0) {
        return { activated: 0, deactivated: 0, totalSelectable: 0 }
      }

      const validLocationIds = new Set(userLocations.map((location) => location.id))
      const invalidIds = selectedLocationIds.filter((id) => !validLocationIds.has(id))

      if (invalidIds.length > 0) {
        throw new Error(`Invalid location IDs for user: ${invalidIds.join(', ')}`)
      }

      const desiredActiveIds = new Set(selectedLocationIds)
      const locationsToActivate = userLocations
        .filter((location) => desiredActiveIds.has(location.id) && location.status !== 'active')
        .map((location) => location.id)
      const locationsToDeactivate = userLocations
        .filter((location) => !desiredActiveIds.has(location.id) && location.status !== 'inactive')
        .map((location) => location.id)

      const [activated, deactivated] = await Promise.all([
        locationsToActivate.length > 0
          ? tx.locations.updateMany({
              where: { id: { in: locationsToActivate } },
              data: { status: 'active', updated_by: userId, updated_at: new Date() }
            })
          : Promise.resolve({ count: 0 }),
        locationsToDeactivate.length > 0
          ? tx.locations.updateMany({
              where: { id: { in: locationsToDeactivate } },
              data: { status: 'inactive', updated_by: userId, updated_at: new Date() }
            })
          : Promise.resolve({ count: 0 })
      ])

      return {
        activated: activated.count,
        deactivated: deactivated.count,
        totalSelectable: userLocations.length
      }
    })
  },

  /**
   * Update all active locations for an organization to inactive
   * Used when subscription is canceled to deactivate all locations
   * 
   * @param organizationId - The organization ID to deactivate locations for
   * @returns BatchPayload with count of locations updated
   */
  deactivateAllLocationsByOrganizationId: async (organizationId: string): Promise<Prisma.BatchPayload> => {
    return await prisma.locations.updateMany({
      where: {
        status: 'active',
        connections: {
          organization_id: organizationId
        }
      },
      data: {
        status: 'inactive',
        updated_at: new Date()
      }
    })
  },

  /**
   * Increment reviews_processed counter for multiple locations
   * @param processedByLocation - Map of locationId to count of reviews to increment
   * @returns Promise that resolves when all updates are complete
   */
  incrementReviewsProcessed: async (processedByLocation: Map<string, number>): Promise<void> => {
    return await prisma.$transaction(async (tx) => {
      for (const [locationId, count] of processedByLocation.entries()) {
        await tx.locations.update({
          where: { id: locationId },
          data: { reviews_processed: { increment: count } }
        })
      }
    })
  },

  buildWhereClause: (params: {
    search?: string
    status?: locations['status']
    userId?: string
    googleLocationId?: string
    connectionId?: string
    organizationId?: string
    createdBy?: string
  }) => {
    const { search, status, userId, googleLocationId, connectionId, organizationId, createdBy } = params
    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { country: { contains: search, mode: 'insensitive' } },
        { 
          connections: {
            organizations: {
              business_name: { contains: search, mode: 'insensitive' }
            }
          }
        },
      ]
    }
    if (status) {
      where.status = status
    }
    if (userId) {
      where.created_by = userId
    }
    if (googleLocationId) {
      where.google_location_id = googleLocationId
    }
    if (connectionId) {
      where.connection_id = connectionId
    }
    if (organizationId) {
      // Filter locations by organization through connections relation
      where.connections = {
        organization_id: organizationId
      }
    }
    if (createdBy) {
      where.created_by = createdBy
    }
    return where
  }
}
