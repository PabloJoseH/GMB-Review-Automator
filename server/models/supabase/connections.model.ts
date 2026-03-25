import { prisma } from '../../../lib/prisma'
import type { connections } from '../../../app/generated/prisma'
import { connection_provider } from '../../../app/generated/prisma'

/**
 * Overview: Connections model for Prisma (Supabase)
 * - Exposes typed operations for `connections` table
 * - Provides dashboard/admin queries and GMB account helpers
 */

// Database operations using Prisma
export const ConnectionsModel = {
  // Dashboard/Admin methods
  findManyWithRelations: async (
    where: Record<string, unknown>, 
    sortBy: string, 
    sortOrder: 'asc' | 'desc', 
    skip: number, 
    take: number,
    includeCount: boolean = false
  ) => {
    if (includeCount) {
      const [connections, totalCount] = await Promise.all([
        prisma.connections.findMany({
          where,
          include: {
            users_connections_user_idTousers: {
              select: { id: true, email: true, name: true, lastname: true, clerk_id: true, username: true }
            },
            locations: {
              select: { id: true, name: true, status: true, verified: true, created_at: true },
              orderBy: { created_at: 'desc' },
              take: 10
            },
            organizations: {
              select: { id: true, business_name: true }
            },
            _count: {
              select: { locations: true }
            }
          },
          orderBy: { [sortBy]: sortOrder },
          skip,
          take
        }),
        prisma.connections.count({ where })
      ])
      return { connections: connections || [] as connections[], totalCount: totalCount as number }
    }
    return prisma.connections.findMany({
      where,
      include: {
        users_connections_user_idTousers: {
          select: { id: true, email: true, name: true, lastname: true, clerk_id: true }
        },
        locations: {
          select: { id: true, name: true, status: true, verified: true, created_at: true },
          orderBy: { created_at: 'desc' },
          take: 10
        }
      },
      orderBy: { [sortBy]: sortOrder },
      skip,
      take
    })
  },

  // GMB Account methods
  findUserConnections: async (userId: string, accountNames?: string[]): Promise<connections[]> => {
    return prisma.connections.findMany({
      where: {
        user_id: userId,
        provider: connection_provider.google,
        ...(accountNames ? { external_account_id: { in: accountNames } } : {})
      },
      select: {
        id: true,
        user_id: true,
        organization_id: true,
        provider: true,
        external_account_id: true,
        type: true,
        pub_sub: true,
        created_at: true,
        updated_at: true
      }
    })
  },

  /**
   * Find active Google connection for a user
   * Used to check Google OAuth status during onboarding
   */
  findActiveConnectionByUserId: async (userId: string): Promise<connections | null> => {
    return prisma.connections.findFirst({
      where: {
        user_id: userId,
        provider: connection_provider.google
      },
      orderBy: {
        created_at: 'desc'
      }
    })
  },

  findConnectionsByIds: async (ids: string[]) => {
    return prisma.connections.findMany({
      where: { id: { in: ids } }
    })
  },

  findConnectionsByExternalIds: async (externalIds: string[]): Promise<connections[]> => {
    return prisma.connections.findMany({
      where: { external_account_id: { in: externalIds } }
    })
  },

  /**
   * Find connections by organization ID and external account IDs.
   * Used to avoid creating duplicate connections during sync.
   */
  findConnectionsByOrganizationAndExternalIds: async (
    organizationId: string,
    externalIds: string[]
  ): Promise<connections[]> => {
    return prisma.connections.findMany({
      where: {
        organization_id: organizationId,
        external_account_id: { in: externalIds }
      },
      select: {
        id: true,
        user_id: true,
        organization_id: true,
        provider: true,
        external_account_id: true,
        type: true,
        pub_sub: true,
        created_at: true,
        updated_at: true
      }
    })
  },

  createManyConnections: async (data: Array<{
    organization_id: string;
    user_id: string;
    provider: 'google';
    external_account_id: string;
    type: string;
  }>) => {
    return prisma.connections.createMany({
      data
    })
  },

  updateConnection: async (id: string, data: Partial<Omit<connections, 'id' | 'created_at' | 'updated_at'>>) => {
    return prisma.connections.update({
      where: { id },
      data
    })
  },

  updateManyConnections: async (  data: {id: string, data: Partial<Omit<connections, 'id' | 'created_at' | 'updated_at'>>}[]) => {
    return prisma.$transaction(async (tx) => {
      for (const item of data) {
        await tx.connections.update({
          where: { id: item.id },
          data: item.data
        })
      }
    })
  },

  updateManyConnectionsByExternalId: async (  data: {external_account_id: string, data: Partial<Omit<connections, 'id' | 'created_at' | 'updated_at'>>}[]) => {
    return prisma.$transaction(async (tx) => {
      for (const item of data) {
        // Find connections by external_account_id first, then update by id
        const connectionsToUpdate = await tx.connections.findMany({
          where: { external_account_id: item.external_account_id },
          select: { id: true }
        })
        for (const conn of connectionsToUpdate) {
          await tx.connections.update({
            where: { id: conn.id },
            data: item.data
          })
        }
      }
    })
  },

  /** upsert many connections */
  upsertManyConnections: async (data: {id: string | undefined, data: Partial<Omit<connections, 'id' | 'created_at' | 'updated_at'>>}[]) => {
    return prisma.$transaction(async (tx) => {
      for (const item of data) {
        await tx.connections.upsert({
          where: { id: item.id },
          update: item.data,
          create: item.data as connections
        })
      }
    })
  },

  /**
   * Upsert many connections by external_account_id
   * Finds existing connection by external_account_id, updates if found, creates if not
   * Note: external_account_id is treated as unique for business logic, but not in schema
   */
  upsertManyConnectionsByExternalId: async (
    data: Array<{
      external_account_id: string
      create: { organization_id: string; user_id: string; type?: string | null }
      update: Partial<Pick<connections, 'organization_id' | 'user_id' | 'type'>>
    }>
  ) => {
    return prisma.$transaction(async (tx) => {
      for (const item of data) {
        // Find existing connection by external_account_id
        const existing = await tx.connections.findFirst({
          where: { external_account_id: item.external_account_id },
          select: { id: true }
        })
        
        if (existing) {
          // Update existing connection
          await tx.connections.update({
            where: { id: existing.id },
            data: item.update
          })
        } else {
          // Create new connection
          await tx.connections.create({
            data: {
              organization_id: item.create.organization_id,
              user_id: item.create.user_id,
              provider: connection_provider.google,
              external_account_id: item.external_account_id,
              type: item.create.type ?? null,
            }
          })
        }
      }
    })
  },

  /**
   * Delete connection by id
   */
  deleteConnection: async (id: string) => {
    return prisma.connections.delete({
      where: { id }
    })
  },

  /**
   * Delete connection(s) by external_account_id
   * Used for unique elimination based on external account ID
   * Note: May delete multiple connections if duplicates exist
   */
  deleteConnectionByExternalId: async (externalAccountId: string) => {
    return prisma.connections.deleteMany({
      where: { external_account_id: externalAccountId }
    })
  },

  /**
   * Delete many connections by external_account_ids
   * Used for bulk unique elimination based on external account IDs
   */
  deleteManyConnectionsByExternalIds: async (externalAccountIds: string[]) => {
    return prisma.connections.deleteMany({
      where: { external_account_id: { in: externalAccountIds } }
    })
  },

  /**
   * Delete many connections by organization id
   */
  deleteManyConnectionsByOrganizationId: async (organizationId: string) => {
    return prisma.connections.deleteMany({
      where: { organization_id: organizationId }
    })
  },

  buildWhereClause: (params: {
    search?: string
    userId?: string
    externalAccountId?: string
    type?: string
    provider?: connections['provider']
    organizationId?: string
    createdBy?: string
    pubSub?: boolean | null
  }) => {
    const { search, userId, externalAccountId, type, provider, organizationId, createdBy, pubSub } = params
    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { external_account_id: { contains: search, mode: 'insensitive' } },
        { type: { contains: search, mode: 'insensitive' } },
        {
          users_connections_user_idTousers: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { lastname: { contains: search, mode: 'insensitive' } },
              { username: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ]
          }
        }
      ]
    }
    if (userId) {
      where.user_id = userId
    }
    if (externalAccountId) {
      where.external_account_id = externalAccountId
    }
    if (type) {
      where.type = type
    }
    if (provider) {
      where.provider = provider
    }
    if (organizationId) {
      where.organization_id = organizationId
    }
    if (createdBy) {
      where.created_by = createdBy
    }
    if (pubSub !== undefined) {
      where.pub_sub = pubSub
    }
    return where
  },

  count: async (where: Record<string, unknown>) => {
    return prisma.connections.count({ where })
  },
}
