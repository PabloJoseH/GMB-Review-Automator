/**
 * Proposed Responses Model - Supabase Database Operations
 * 
 * Overview: This model handles all database operations related to proposed responses
 * for Google My Business reviews. It includes CRUD operations and upsert functionality
 * for managing proposed responses efficiently using Prisma.
 * 
 * Main functionalities:
 * - Create single or multiple proposed responses
 * - Read operations with various filters (by ID, location, user)
 * - Update existing proposed responses
 * - Delete proposed responses
 * - Upsert operations for creating or updating responses
 * - Transactions for data consistency
 */

import { prisma } from '@/lib/prisma'
import type { proposed_responses, Prisma, users, locations } from '@/app/generated/prisma'

// Type derived from Prisma for create operations (excluding auto-generated fields)
export type ProposedResponseToCreate = Omit<proposed_responses, 'id' | 'created_at' | 'updated_at'>

// Type for update operations (all fields optional except id)
export type ProposedResponseToUpdate = Partial<Omit<proposed_responses, 'id' | 'created_at'>> & {
  id: string
}

// Type for location with proposed responses grouped
export type LocationWithProposedResponses = locations & {
  proposed_responses: proposed_responses[]
}

// Type for user with locations grouped by location_id
export type UserWithGroupedLocations = {
  user: users
  locations: LocationWithProposedResponses[]
}

export const ProposedResponsesModel = {
  /**
   * Create a single proposed response
   * @param data - Proposed response data to create
   * @returns Created proposed response
   */
  create: async (data: ProposedResponseToCreate): Promise<proposed_responses> => {
    return await prisma.proposed_responses.create({
      data: {
        ...data,
        updated_at: new Date()
      }
    })
  },

  /**
   * Create multiple proposed responses in batch
   * @param data - Array of proposed responses to create
   * @returns Result of the createMany operation
   */
  createMany: async (data: ProposedResponseToCreate[]): Promise<Prisma.BatchPayload> => {
    return await prisma.proposed_responses.createMany({
      data: data.map(item => ({
        ...item,
        updated_at: new Date()
      })),
      skipDuplicates: true
    })
  },

  /**
   * Find proposed response by ID
   * @param id - ID of the proposed response
   * @returns Proposed response or null if not found
   */
  findById: async (id: string): Promise<proposed_responses | null> => {
    return await prisma.proposed_responses.findUnique({
      where: { id }
    })
  },

  /**
   * Find proposed responses by location ID
   * @param locationId - Location ID to filter by
   * @param orderBy - Optional ordering (default: created_at desc)
   * @returns Array of proposed responses for the location
   */
  findByLocationId: async (
    locationId: string,
    orderBy: 'created_at' | 'updated_at' | 'create_time' = 'created_at',
    order: 'asc' | 'desc' = 'desc'
  ): Promise<proposed_responses[]> => {
    return await prisma.proposed_responses.findMany({
      where: { location_id: locationId },
      orderBy: { [orderBy]: order }
    })
  },

  /**
   * Find active locations created by user ID that have proposed responses
   * @param userId - User ID to filter by
   * @param orderBy - Optional ordering for proposed responses (default: created_at desc)
   * @returns User with active locations, each location containing its proposed responses
   */
  findByUserId: async (
    userId: string,
    orderBy: 'created_at' | 'updated_at' | 'create_time' = 'created_at',
    order: 'asc' | 'desc' = 'desc'
  ): Promise<UserWithGroupedLocations | null> => {
    // First, get the user to ensure it exists
    const [user, locations] = await Promise.all([
      prisma.users.findUnique({
        where: { id: userId }
      }),
      prisma.locations.findMany({
        where: {
          created_by: userId,
          status: 'active',
          proposed_responses: {
            some: {} // Only locations that have at least one proposed response
          }
        },
        include: {
          proposed_responses: {
            orderBy: { [orderBy]: order }
          }
        }
      })
    ])

    if (!user) {
      return null
    }

    // Map to the expected type structure
    const locationsWithProposedResponses: LocationWithProposedResponses[] = locations.map(location => ({
      ...location,
      proposed_responses: location.proposed_responses
    }))

    return {
      user,
      locations: locationsWithProposedResponses
    }
  },

  /**
   * Find many proposed responses with optional filters
   * @param where - Prisma where clause for filtering
   * @param orderBy - Optional ordering (default: created_at desc)
   * @param skip - Number of records to skip for pagination
   * @param take - Number of records to take for pagination
   * @param includeLocations - Whether to include location relation (default: false)
   * @returns Array of proposed responses matching the filters
   */
  findMany: async (
    where?: Prisma.proposed_responsesWhereInput,
    orderBy: 'created_at' | 'updated_at' | 'create_time' = 'created_at',
    order: 'asc' | 'desc' = 'desc',
    skip?: number,
    take?: number,
    includeLocations: boolean = false
  ): Promise<(proposed_responses & { locations?: { id: string; name: string | null } | null })[]> => {
    const result = await prisma.proposed_responses.findMany({
      where,
      orderBy: { [orderBy]: order },
      skip,
      take,
      include: includeLocations ? {
        locations: {
          select: {
            id: true,
            name: true
          }
        }
      } : undefined
    })
    
    return result as (proposed_responses & { locations?: { id: string; name: string | null } | null })[]
  },

  /**
   * Count proposed responses matching filters
   * @param where - Prisma where clause for filtering
   * @returns Count of matching records
   */
  count: async (where?: Prisma.proposed_responsesWhereInput): Promise<number> => {
    return await prisma.proposed_responses.count({ where })
  },

  /**
   * Get unique location IDs from proposed responses matching filters
   * @param where - Prisma where clause for filtering
   * @returns Array of unique location IDs
   */
  findUniqueLocationIds: async (
    where?: Prisma.proposed_responsesWhereInput
  ): Promise<string[]> => {
    const result = await prisma.proposed_responses.groupBy({
      by: ['location_id'],
      where: where,
      _count: {
        location_id: true
      }
    })
    
    return result
      .map(item => item.location_id)
      .filter((id): id is string => id !== null)
  },

  /**
   * Update a proposed response by ID
   * @param id - ID of the proposed response to update
   * @param data - Partial data to update
   * @returns Updated proposed response
   */
  update: async (
    id: string,
    data: Partial<Omit<proposed_responses, 'id' | 'created_at'>>
  ): Promise<proposed_responses> => {
    return await prisma.proposed_responses.update({
      where: { id },
      data: {
        ...data,
        updated_at: new Date()
      }
    })
  },

  /**
   * Update many proposed responses matching criteria
   * @param where - Prisma where clause for filtering
   * @param data - Partial data to update
   * @returns Result of the updateMany operation
   */
  updateMany: async (
    where: Prisma.proposed_responsesWhereInput,
    data: Partial<Omit<proposed_responses, 'id' | 'created_at'>>
  ): Promise<Prisma.BatchPayload> => {
    return await prisma.proposed_responses.updateMany({
      where,
      data: {
        ...data,
        updated_at: new Date()
      }
    })
  },

  /**
   * Delete a proposed response by ID
   * @param id - ID of the proposed response to delete
   * @returns Deleted proposed response
   */
  delete: async (id: string): Promise<proposed_responses> => {
    return await prisma.proposed_responses.delete({
      where: { id }
    })
  },

  /**
   * Delete many proposed responses matching criteria
   * @param where - Prisma where clause for filtering
   * @returns Result of the deleteMany operation
   */
  deleteMany: async (where: Prisma.proposed_responsesWhereInput): Promise<Prisma.BatchPayload> => {
    return await prisma.proposed_responses.deleteMany({ where })
  },

  /**
   * Upsert a proposed response (create or update)
   * @param where - Unique identifier for finding existing record
   * @param create - Data to create if record doesn't exist
   * @param update - Data to update if record exists
   * @returns Created or updated proposed response
   */
  upsert: async (
    where: Prisma.proposed_responsesWhereUniqueInput,
    create: ProposedResponseToCreate,
    update: Partial<Omit<proposed_responses, 'id' | 'created_at'>>
  ): Promise<proposed_responses> => {
    return await prisma.proposed_responses.upsert({
      where,
      create: {
        ...create,
        updated_at: new Date()
      },
      update: {
        ...update,
        updated_at: new Date()
      }
    })
  }
}

