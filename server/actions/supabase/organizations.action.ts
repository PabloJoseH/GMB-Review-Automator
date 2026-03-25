'use server'

import { subscriptions } from '@/app/generated/prisma'
import { createLogger } from '@/lib/logger'
import { PaginatedApiResponse } from '@/lib/api-types'
import { Organization } from '@/lib/prisma-types'
import { getAuthenticatedDatabaseUserId } from '@/lib/server-action-auth'
import { checkIfStaff } from '@/lib/auth-helpers'
import { ConnectionsModel } from '@/server/models/supabase/connections.model'
import { OrganizationsModel } from '../../models/supabase/organizations.model'
import { unsubscribeAllPubSubTopics } from '@/server/actions/gmb/pub-sub.action'
import { ClerkOrganizationMembershipsModel } from '@/server/models/clerk/organizationMemberships.model'
import { cancelSubscription } from './subscriptions.action'
import { findSubscriptionByOrganizationId } from './subscriptions.action'
import { UsersModel } from '@/server/models/supabase/users.model'
const logger = createLogger('ORGANIZATIONS')


/**
 * Overview: Organizations server actions for Supabase
 * - Handles organization CRUD operations directly through model layer
 * - Provides pagination and search functionality
 * - Manages organization data with user relations
 * - Deletes organizations from Clerk when deleting from database
 * - Follows layered architecture: Action → Model → DB
 */

export interface OrganizationsQueryParams {
  page: number
  limit: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  created_by?: string
  subscription?: {
    status?: subscriptions['status']
    plan_id?: string
    stripe_customer_id?: string
    active_at?: string
    past_due_at?: string
    next_payment_amount?: string
    periodStart?: string
    currency?: string
  }
}

/**
 * Paginated organizations response
 * Uses Prisma-generated Organization type for maximum type safety
 */
export type PaginatedOrganizationsResponse = PaginatedApiResponse<{
  organizations: Organization[]
}>

function buildWhereClause(params: OrganizationsQueryParams) {
  return OrganizationsModel.buildWhereClause({
    search: params.search,
    created_by: params.created_by,
    subscription: params.subscription
  })
}

export async function getPaginatedOrganizations(params: OrganizationsQueryParams) : Promise<PaginatedOrganizationsResponse> {
  try {
    const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)
    if (!isStaff && params.created_by && params.created_by !== dbUserId) {
      return {
        success: false,
        pagination: {
          page: params.page,
          limit: params.limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        },
        message: 'Unauthorized organization access',
        error: 'Forbidden organization access'
      }
    }

    logger.debug('Getting paginated organizations', {
      page: params.page,
      limit: params.limit,
      search: params.search,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      created_by: params.created_by || dbUserId
    })

    const offset = (params.page - 1) * params.limit
    const createdBy = isStaff ? params.created_by : (params.created_by || dbUserId)
    const where = buildWhereClause({ ...params, created_by: createdBy })
    const sortBy = params.sortBy || 'created_at'
    const sortOrder = params.sortOrder || 'desc'


    const { organizations, totalCount } = await OrganizationsModel.findManyWithRelations(
      where,
      sortBy, 
      sortOrder, 
      offset, 
      params.limit, 
      true // includeCount = true
    ) as { organizations: unknown[], totalCount: number }

    const totalPages = Math.ceil(totalCount / params.limit)
    const hasNext = params.page < totalPages
    const hasPrev = params.page > 1

    logger.debug('Organizations retrieved successfully', {
      totalOrganizations: totalCount,
      currentPage: params.page,
      totalPages: totalPages
    })

    return {
      success: true,
      data: {
        organizations: organizations as Organization[]
      },
      pagination: {
        page: params.page,
        limit: params.limit,
        total: totalCount,
        totalPages,
        hasNext,
        hasPrev
      },
      message: 'Organizations retrieved successfully'
    }
  } catch (error) {
    logger.error('Error getting paginated organizations', error)
    return {
      success: false,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      },
      message: 'Error getting paginated organizations',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get paginated organizations WITH location counts (active and total)
 * ONLY for dashboard tables - OPTIMIZED query
 * 
 * Strategy:
 * 1. Fetch organizations with full relations in parallel
 * 2. Calculate location counts in memory from fetched data
 * 3. Minimal queries for better performance
 * 
 */
export async function getOrganizationsWithLocationCounts(params: OrganizationsQueryParams): Promise<PaginatedOrganizationsResponse> {
  try {
    const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)
    if (!isStaff && params.created_by && params.created_by !== dbUserId) {
      return {
        success: false,
        pagination: {
          page: params.page,
          limit: params.limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
        message: 'Unauthorized organization access',
        error: 'Forbidden organization access',
      }
    }

    logger.debug('Getting organizations with location counts (single query)', {
      page: params.page,
      limit: params.limit,
    })

    const offset = (params.page - 1) * params.limit
    const createdBy = isStaff ? params.created_by : (params.created_by || dbUserId)
    const where = buildWhereClause({ ...params, created_by: createdBy })
    const sortBy = params.sortBy || 'created_at'
    const sortOrder = params.sortOrder || 'desc'

    // 🚀 Execute all queries in parallel via model
    const { organizations, totalCount } = await OrganizationsModel.findManyWithLocationsForCount(
      where,
      sortBy,
      sortOrder,
      offset,
      params.limit
    )

    // ⚡ Add counts directly in memory
    const organizationsWithCounts = organizations.map(org => {
      const allLocations = org.connections.flatMap(conn => conn.locations)
      const total = allLocations.length
      const active = allLocations.filter(loc => loc.status === 'active').length

      return {
        ...org,
        _count: {
          locations: total,
          activeLocations: active,
        },
      }
    })

    //  Pagination
    const totalPages = Math.ceil(totalCount / params.limit)
    const hasNext = params.page < totalPages
    const hasPrev = params.page > 1

    const result: PaginatedOrganizationsResponse = {
      success: true,
      data: { organizations: organizationsWithCounts as Organization[] },
      pagination: {
        page: params.page,
        limit: params.limit,
        total: totalCount,
        totalPages,
        hasNext,
        hasPrev,
      },
      message: 'Organizations with location counts retrieved successfully',
    }

    logger.debug('Organizations with location counts retrieved (single query)', {
      totalOrganizations: totalCount,
      currentPage: params.page,
      totalPages,
    })

    return result
  } catch (error) {
    logger.error('Failed to get organizations with location counts', error)
    return {
      success: false,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
      message: 'Failed to retrieve organizations with location counts',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * Get organization by ID
 */
export async function getOrganizationById(id: string) {
  try {
    const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)
    const user = await UsersModel.findUserById(dbUserId)
    if (!isStaff && (!user || user.organization_id !== id)) {
      return {
        success: false,
        error: 'Forbidden organization access',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Getting organization by ID', { organizationId: id })

    const organization = await OrganizationsModel.findOrganizationById(id)

    if (!organization) {
      return {
        success: false,
        error: 'Organization not found',
        message: 'No organization found with this ID'
      }
    }

    logger.debug('Organization retrieved successfully', { 
      organizationId: organization.id,
      business_name: organization.business_name,
    })

    return {
      success: true,
      data: organization,
      message: 'Organization retrieved successfully'
    }
  } catch (error) {
    logger.error('Error getting organization by ID', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error getting organization by ID',
      message: 'Error getting organization by ID'
    }
  }
}

/**
 * Get organization by ID with relations (subscription, users)
 * Used in: organization detail pages
 */
export async function getOrganizationByIdWithRelations(id: string) {
  try {
    const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)
    const user = await UsersModel.findUserById(dbUserId)
    if (!isStaff && (!user || user.organization_id !== id)) {
      return {
        success: false,
        error: 'Forbidden organization access',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Getting organization by ID with relations', { organizationId: id })

    const organization = await OrganizationsModel.findOrganizationByIdWithRelations(id)

    if (!organization) {
      return {
        success: false,
        error: 'Organization not found',
        message: 'No organization found with this ID'
      }
    }

    logger.debug('Organization with relations retrieved successfully', { 
      organizationId: organization.id,
      business_name: organization.business_name,
    })

    return {
      success: true,
      data: organization,
      message: 'Organization retrieved successfully'
    }
  } catch (error) {
    logger.error('Error getting organization by ID with relations', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error getting organization by ID with relations',
      message: 'Error getting organization by ID with relations'
    }
  }
}

/**
 * Get organization by Clerk ID
 */
export async function getOrganizationByClerkId(clerkId: string) {
  try {
    const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)

    logger.debug('Getting organization by Clerk ID', { clerkId })

    const organization = await OrganizationsModel.findOrganizationByClerkId(clerkId)

    if (!organization) {
      return {
        success: false,
        error: 'Organization not found',
        message: 'No organization found with this Clerk ID'
      }
    }

    const user = await UsersModel.findUserById(dbUserId)
    if (!isStaff && (!user || user.organization_id !== organization.id)) {
      return {
        success: false,
        error: 'Forbidden organization access',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Organization retrieved successfully', { 
      organizationId: organization.id,
      business_name: organization.business_name,
    })

    return {
      success: true,
      data: organization,
      message: 'Organization retrieved successfully'
    }

  } catch (error) {
    logger.error('Error getting organization by Clerk ID', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error getting organization by Clerk ID',
      message: 'Error getting organization by Clerk ID'
    }
  }
}

/**
 * Create organization
 */
export async function createOrganization(organizationData: {
  business_name: string
  business_address: string
  business_id: string
  created_by: string
  email: string
  primary_phone: string
  organization_clerk_id: string
}) {
  try {
    logger.debug('Creating organization', {
      business_name: organizationData.business_name,
    })

    const organization = await OrganizationsModel.createOrganization(organizationData)

    logger.debug('Organization created successfully', { 
      organizationId: organization.id,
      business_name: organization.business_name,
    })

    return {
      success: true,
      data: organization,
      message: 'Organization created successfully'
    }

  } catch (error) {
    logger.error('Error creating organization', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error creating organization',
      message: 'Error creating organization'
    }
  }
}

/**
 * Update organization
 * Updates organization data in the database
 */
export async function updateOrganization(id: string, organizationData: Partial<{
  business_name: string
  business_address: string
  business_id: string
  created_by: string
  email: string
  primary_phone: string
  organization_clerk_id: string
  first_line_of_address?: string
  city?: string
  region?: string
  zip_code?: string
  country?: string
  tax_identifier?: string
}>) {
  try {
    const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)
    const user = await UsersModel.findUserById(dbUserId)
    if (!isStaff && (!user || user.organization_id !== id)) {
      return {
        success: false,
        error: 'Forbidden organization access',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Updating organization', { 
      organizationId: id,
      updateFields: Object.keys(organizationData)
    })

    // Get current organization
    const currentOrg = await OrganizationsModel.findOrganizationById(id)
    if (!currentOrg) {
      return {
        success: false,
        error: 'Organization not found',
        message: 'No organization updated'
      }
    }

    // If individual address fields changed, rebuild business_address to keep it synchronized
    const addressFieldsChanged = 
      organizationData.first_line_of_address !== undefined ||
      organizationData.city !== undefined ||
      organizationData.region !== undefined ||
      organizationData.zip_code !== undefined ||
      organizationData.country !== undefined

    if (addressFieldsChanged && !organizationData.business_address) {
      // Rebuild business_address from individual fields (use updated values or current DB values)
      const { buildBusinessAddress } = await import('@/lib/utils')
      const rebuiltAddress = buildBusinessAddress({
        first_line_of_address: organizationData.first_line_of_address ?? currentOrg.first_line_of_address,
        city: organizationData.city ?? currentOrg.city,
        region: organizationData.region ?? currentOrg.region,
        zip_code: organizationData.zip_code ?? currentOrg.zip_code,
        country: organizationData.country ?? currentOrg.country
      })
      
      if (rebuiltAddress) {
        organizationData.business_address = rebuiltAddress
        logger.debug('Rebuilt business_address from individual fields', {
          organizationId: id,
          business_address: rebuiltAddress
        })
      }
    }

    // Update organization in database
    const organization = await OrganizationsModel.updateOrganization(id, organizationData)

    if (!organization) {
      return {
        success: false,
        error: 'Organization not found',
        message: 'No organization updated'
      }
    }

    logger.debug('Organization updated successfully', { 
      organizationId: organization.id,
      business_name: organization.business_name,
    })

    return {
      success: true,
      data: organization,
      message: 'Organization updated successfully'
    }

  } catch (error) {
    logger.error('Error updating organization', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error updating organization',
      message: 'Error updating organization'
    }
  }
}

/**
 * Delete organization
 * Deletes from Clerk first if organization_clerk_id exists, then from database
 * Also cancels Stripe subscription immediately if it exists before deletion
 * IMPORTANT: If Stripe cancellation fails, the organization deletion is aborted to prevent orphaned subscriptions
 * NOTE: Cancellation is immediate by default - user loses access right away. No automatic refund for unused period.
 * Before deletion, updates all users with OWNER role to USER role and sets their onboarding_status to 'user'
 */
export async function deleteOrganization(id: string) {
  try {
    const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)
    const user = await UsersModel.findUserById(dbUserId)
    if (!isStaff && (!user || user.organization_id !== id)) {
      return {
        success: false,
        error: 'Forbidden organization access',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Deleting organization', { organizationId: id })

    // First, get the organization to check if it has a Clerk ID
    const organization = await OrganizationsModel.findOrganizationById(id)
    
    if (!organization) {
      return {
        success: false,
        error: 'Organization not found',
        message: 'No organization deleted'
      }
    }

    // Cancel Stripe subscription immediately if it exists - MUST succeed before deletion
    const subscriptionResult = await findSubscriptionByOrganizationId(id)
    if (subscriptionResult.success && subscriptionResult.data) {
      const subscription = subscriptionResult.data
      
      if (subscription.stripe_subscription_id && subscription.status !== 'canceled') {
        logger.debug('Cancelling Stripe subscription immediately before organization deletion', { 
          organizationId: id,
          stripeSubscriptionId: subscription.stripe_subscription_id
        })
        
        const cancelResult = await cancelSubscription(id, {
          id: subscription.stripe_subscription_id,
          status: 'canceled'
        }, true)
        
        if (!cancelResult.success) {
          logger.error('Failed to cancel Stripe subscription, aborting organization deletion', {
            organizationId: id,
            stripeSubscriptionId: subscription.stripe_subscription_id,
            error: cancelResult.error
          })
          
          return {
            success: false,
            error: `Failed to cancel Stripe subscription: ${cancelResult.error}`,
            message: 'Cannot delete organization: Stripe subscription cancellation failed. Please cancel the subscription manually in Stripe before deleting the organization.'
          }
        }
        
        logger.debug('Stripe subscription cancelled immediately', {
          organizationId: id,
          stripeSubscriptionId: subscription.stripe_subscription_id
        })
      }
    }

    // Delete from Clerk first if organization_clerk_id exists
    if (organization.organization_clerk_id) {
      logger.debug('Deleting organization from Clerk', { 
        clerkOrgId: organization.organization_clerk_id 
      })
      
      const clerkResult = await ClerkOrganizationMembershipsModel.deleteClerkOrganization(
        organization.organization_clerk_id
      )
      
      if (!clerkResult.success) {
        logger.debug('Failed to delete organization from Clerk, continuing with DB deletion', {
          clerkOrgId: organization.organization_clerk_id,
          error: clerkResult.error
        })
        // Continue with DB deletion even if Clerk deletion fails
      } else {
        logger.debug('Organization deleted from Clerk successfully', {
          clerkOrgId: organization.organization_clerk_id
        })
      }
    }

    // Update users with OWNER role to USER role and set onboarding_status to 'user'
    // This ensures users don't lose access but are downgraded appropriately
    const ownerUsersUpdate = await UsersModel.updateManyUsersByOrganizationAndRole(
      id,
      'OWNER',
      {
        role: 'USER',
        onboarding_status: 'user'
      }
    )

    if (ownerUsersUpdate.count > 0) {
      logger.debug('Updated OWNER users to USER role and onboarding_status', {
        organizationId: id,
        usersUpdated: ownerUsersUpdate.count
      })
    }

    // Then delete from database (subscription will be cascade deleted)
    const deletedOrganization = await OrganizationsModel.deleteOrganization(id)

    logger.debug('Organization deleted successfully', { 
      organizationId: deletedOrganization.id,
      business_name: deletedOrganization.business_name,
    })

    return {
      success: true,
      data: deletedOrganization,
      message: 'Organization deleted successfully'
    }

  } catch (error) {
    logger.error('Error deleting organization', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error deleting organization',
      message: 'Error deleting organization'
    }
  }
}

/**
 * Reset organization data
 * delete all accounts
 */

export async function resetOrganizationData(userId: string) {
  try {
    const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)
    if (!isStaff && dbUserId !== userId) {
      return {
        success: false,
        error: 'Forbidden organization access',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Resetting organization accounts of user: ', { userId })
    const organization = await OrganizationsModel.findOrganizationByCreator(userId)
    if (!organization) {
      return {
        success: false,
        error: 'Organization not found',
        message: 'No organization found with this user ID'
      }
    }
    // Unsubscribe from all Pub/Sub topics before removing related records
    await unsubscribeAllPubSubTopics(userId)

    const connections = await ConnectionsModel.deleteManyConnectionsByOrganizationId(organization.id)
    if (!connections) {
      return {
        success: false,
        error: 'Connections not deleted',
        message: 'No connections found with this organization ID'
      }
    }
    return {
      success: true,
      message: 'Organization accounts deleted successfully'
    }
  } catch (error) {
    logger.error('Error resetting organization data', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error resetting organization data',
      message: 'Error resetting organization data'
    }
  }
}