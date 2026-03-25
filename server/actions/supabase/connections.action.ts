/**
 * @fileoverview Connections server actions for Supabase.
 *
 * @remarks
 * Provides CRUD operations, pagination, and lookup helpers for connection records.
 *
 * Key exports:
 * - `getPaginatedConnections`
 * - `getConnectionLocationsPaginated`
 * - `createManyConnections`
 * - `updateConnection`
 * - `deleteConnection`
 *
 * Relevant types:
 * - `ConnectionsQueryParams`
 * - `PaginatedConnectionsResponse`
 */
'use server'

import { ConnectionsModel } from '../../models/supabase/connections.model'
import type { connections, locations } from '../../../app/generated/prisma'
import { createLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { UsersModel } from '@/server/models/supabase/users.model'
import { getAuthenticatedOrganizationAccess, requireServerActionUser } from '@/lib/server-action-auth'
import { checkIfStaff } from '@/lib/auth-helpers'

const logger = createLogger('CONNECTIONS')

async function getOrganizationAccessForAdmin(requestedOrganizationId?: string) {
  const { clerkUserId } = await requireServerActionUser()
  const isStaff = await checkIfStaff(clerkUserId)

  if (isStaff) {
    return { isStaff, organizationId: requestedOrganizationId }
  }

  const { organizationId } = await getAuthenticatedOrganizationAccess()
  return { isStaff, organizationId }
}

export interface ConnectionsQueryParams {
  page: number
  limit: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  userId?: string
  externalAccountId?: string
  type?: string
  provider?: connections['provider']
  organizationId?: string
  createdBy?: string
  pubSub?: boolean | null
  status?: string
}

export interface ConnectionWithLocationCount extends connections {
  locations?: Pick<locations, 'id' | 'name' | 'status'>[]
  _count?: {
    locations: number
  }
}

export interface PaginatedConnectionsResponse {
  connections: ConnectionWithLocationCount[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

function buildWhereClause(params: ConnectionsQueryParams) {
  let pubSub: boolean | null | undefined = undefined
  
  if (params.status === 'active') {
    pubSub = true
  } else if (params.status === 'inactive') {
    pubSub = false
  }
  
  return ConnectionsModel.buildWhereClause({
    search: params.search,
    userId: params.userId,
    externalAccountId: params.externalAccountId,
    type: params.type,
    provider: params.provider,
    organizationId: params.organizationId,
    createdBy: params.createdBy,
    pubSub: pubSub
  })
}

/**
 * get paginated connections
 */
export async function getPaginatedConnections(params: ConnectionsQueryParams) : Promise<PaginatedConnectionsResponse> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin(params.organizationId)
    if (!isStaff && params.organizationId && params.organizationId !== organizationId) {
      return {
        connections: [],
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

    logger.debug('Getting paginated connections', {
      page: params.page,
      limit: params.limit,
      search: params.search,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    })

    const offset = (params.page - 1) * params.limit
    const where = buildWhereClause({ ...params, organizationId })
    const sortBy = params.sortBy || 'created_at'
    const sortOrder = params.sortOrder || 'desc'

    const result = await ConnectionsModel.findManyWithRelations(where, sortBy, sortOrder, offset, params.limit, true)
    const { connections, totalCount } = result as unknown as { connections: (connections & { locations?: locations[], _count?: { locations: number } })[], totalCount: number }

    // The model already includes _count from Prisma, no need to override it
    return {
      connections: connections as ConnectionWithLocationCount[],
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
    logger.error('Error getting paginated connections', error)
    return {
      connections: [],
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
 * find user connections
 */

/**
 * Get paginated locations for a specific connection
 * Follows the same pattern as other paginated actions
 */
export async function getConnectionLocationsPaginated(
  connectionId: string,
  page: number = 1,
  limit: number = 10
): Promise<{ locations: Pick<locations, 'id' | 'name' | 'status'>[], totalCount: number }> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    logger.debug('Getting paginated connection locations', {
      connectionId,
      page,
      limit,
    })

    const offset = (page - 1) * limit
    const connection = await prisma.connections.findFirst({
      where: isStaff ? { id: connectionId } : { id: connectionId, organization_id: organizationId },
      select: { id: true }
    })

    if (!connection) {
      return { locations: [], totalCount: 0 }
    }

    // Use efficient Prisma query without transaction for simple read operations
    const [locations, totalCount] = await Promise.all([
      prisma.locations.findMany({
        where: {
          connection_id: connectionId
        },
        select: {
          id: true,
          name: true,
          status: true
        },
        orderBy: {
          created_at: 'desc'
        },
        skip: offset,
        take: limit
      }),
      prisma.locations.count({
        where: {
          connection_id: connectionId
        }
      })
    ])

    return { locations, totalCount }
  } catch (error) {
    logger.error('Error getting paginated connection locations', error)
    return {
      locations: [],
      totalCount: 0
    }
  }
}

export async function findUserConnections(userId: string, accountNames?: string[]) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const user = await UsersModel.findUserById(userId)
    if (!isStaff && (!user || user.organization_id !== organizationId)) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized user access'
      }
    }

    logger.debug('Finding user connections', { userId, accountNames })

    const connections = await ConnectionsModel.findUserConnections(userId, accountNames)

    if (!connections) {
      return {
        success: false,
        error: 'No connections found',
        message: 'No connections found'
      }
    }

    return {
      success: true,
      data: connections,
      message: 'Connections found'
    }

  } catch (error) {
    logger.error('Error finding user connections', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Error finding user connections'
    }
  }
}

export async function findConnectionsByIds(ids: string[]) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    logger.debug('Finding connections by IDs', { ids })

    const connections = await ConnectionsModel.findConnectionsByIds(ids)
    
    if (!connections) {
      return {
        success: false,
        error: 'No connections found',
        message: 'No connections found'
      }
    }

    const filteredConnections = isStaff
      ? connections
      : connections.filter(connection => connection.organization_id === organizationId)
    if (!filteredConnections.length) {
      return {
        success: false,
        error: 'No connections found',
        message: 'No connections found'
      }
    }

    return {
      success: true,
      data: filteredConnections,
      message: 'Connections found'
    }
  } catch (error) {
    logger.error('Error finding connections by IDs', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Error finding connections by IDs'
    }
  }
}

export async function findConnectionsByExternalIds(externalIds: string[]) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    logger.debug('Finding connections by external IDs', { externalIds })

    const connections = await ConnectionsModel.findConnectionsByExternalIds(externalIds)

    if (!connections) {
      return {
        success: false,
        error: 'No connections found',
        message: 'No connections found'
      }
    }

    const filteredConnections = isStaff
      ? connections
      : connections.filter(connection => connection.organization_id === organizationId)
    if (!filteredConnections.length) {
      return {
        success: false,
        error: 'No connections found',
        message: 'No connections found'
      }
    }

    return {
      success: true,
      data: filteredConnections,
      message: 'Connections found'
    }
  } catch (error) {
    logger.error('Error finding connections by external IDs', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Error finding connections by external IDs'
    }
  }
}


export async function createManyConnections(data: Array<{
  organization_id: string;
  user_id: string;
  provider: connections['provider'];
  external_account_id: string;
  type: string;
}>) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const organizationIds = new Set(data.map(item => item.organization_id))
    if (!isStaff && (organizationIds.size > 1 || !organizationIds.has(organizationId))) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    const userIds = Array.from(new Set(data.map(item => item.user_id)))
    const users = await prisma.users.findMany({
      where: isStaff
        ? { id: { in: userIds } }
        : { id: { in: userIds }, organization_id: organizationId },
      select: { id: true }
    })

    if (users.length !== userIds.length) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized user access'
      }
    }

    logger.debug('Creating many connections', { connections: data.length })

    const connections = await ConnectionsModel.createManyConnections(data)

    if (!connections) {
      return {
        success: false,
        error: 'No connections created',
        message: 'No connections created'
      }
    }

    return {
      success: true,
      data: connections,
      message: 'Connections created'
    }

  } catch (error) {
    logger.error('Error creating many connections', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Error creating many connections'
    }
  }
}

export async function updateConnection(id: string, data: Partial<{
  organization_id: string;
  user_id: string;
  provider: connections['provider'];
  external_account_id: string;
  type: string;
}>) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff && data.organization_id && data.organization_id !== organizationId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    if (!isStaff && data.user_id) {
      const user = await UsersModel.findUserById(data.user_id)
      if (!user || user.organization_id !== organizationId) {
        return {
          success: false,
          error: 'Unauthorized',
          message: 'Unauthorized user access'
        }
      }
    }

    const existingConnection = await prisma.connections.findFirst({
      where: isStaff ? { id } : { id, organization_id: organizationId },
      select: { id: true }
    })

    if (!existingConnection) {
      return {
        success: false,
        error: 'No connection updated',
        message: 'No connection updated'
      }
    }

    logger.debug('Updating connection', { id , data: Object.keys(data) })

    const connection = await ConnectionsModel.updateConnection(id, data)

    if (!connection) {
      return {
        success: false,
        error: 'No connection updated',
        message: 'No connection updated'
      }
    }
    return {
      success: true,
      data: connection,
      message: 'Connection updated'
    }
  } catch (error) {
    logger.error('Error updating connection', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Error updating connection'
    }
  }
}

export async function deleteConnection(id: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const existingConnection = await prisma.connections.findFirst({
      where: isStaff ? { id } : { id, organization_id: organizationId },
      select: { id: true }
    })

    if (!existingConnection) {
      return {
        success: false,
        error: 'No connection found',
        message: 'No connection deleted'
      }
    }

    logger.debug('Deleting connection', { id })

    const connection = await ConnectionsModel.deleteConnection(id)

    if (!connection) {
      return {
        success: false,
        error: 'No connection found',
        message: 'No connection deleted'
      }
    }
    return {
      success: true,
      data: connection,
      message: 'Connection deleted'
    }
  } catch (error) {
    logger.error('Error deleting connection', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Error deleting connection'
    }
  }
}

export async function countConnections(where: Record<string, unknown>) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff && typeof where.organization_id === 'string' && where.organization_id !== organizationId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Counting connections', { where: Object.keys(where) })

    const count = await ConnectionsModel.count(isStaff ? where : { ...where, organization_id: organizationId })

    return {
      success: true,
      data: count,
      message: 'Connections counted'
    }

  } catch (error) {
    logger.error('Error counting connections', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Error counting connections'
    }
  }
}