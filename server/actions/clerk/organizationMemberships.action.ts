'use server'

import { ClerkOrganizationMembershipsModel } from '../../models/clerk/organizationMemberships.model'
import { createLogger } from '@/lib/logger'
import { APP_CONSTANTS } from '@/lib/constants'
import { auth } from '@clerk/nextjs/server'
import { UsersModel } from '../../models/supabase/users.model'
import { OrganizationsModel } from '../../models/supabase/organizations.model'
import { OrganizationData, CreateOrganizationInput } from '../../models/clerk/organizationMemberships.model'
import type { users } from '@/app/generated/prisma'

const logger = createLogger('CLERK-ORGS')


/**
 * Overview: Clerk Organization Memberships Server Actions
 * - Handles organization membership operations
 * - Fetches user memberships from Clerk API
 * - Provides CRUD operations for memberships
 */

/**
 * Get user organization memberships
 */
export async function getUserMemberships(userId: string) {
  try {
    logger.debug('Fetching organization memberships', { userId })
    
    const memberships = await ClerkOrganizationMembershipsModel.fetchMemberships(userId)
    
    logger.debug('Organization memberships fetched successfully', { 
      userId, 
      count: memberships.length 
    })
    
    return {
      success: true,
      data: { memberships },
      message: 'Organization memberships fetched successfully'
    }
  } catch (error) {
    logger.error('Failed to fetch organization memberships for user', error, { userId })
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to fetch organization memberships'
    }
  }
}

/**
 * Get specific organization membership by user ID and organization ID
 */
export async function getOrganizationMembership(userId: string, organizationId: string) {
  try {
    logger.debug('Fetching organization membership', { userId, organizationId })
    
    const membership = await ClerkOrganizationMembershipsModel.getMembership(userId, organizationId)
    
    if (!membership) {
      return {
        success: false,
        error: 'Membership not found',
        message: 'No membership found for this user and organization'
      }
    }
    
    logger.debug('Organization membership fetched successfully', { 
      userId, 
      organizationId,
      membershipId: membership.id
    })
    
    return {
      success: true,
      data: membership,
      message: 'Organization membership fetched successfully'
    }
  } catch (error) {
    logger.error('Failed to fetch organization membership for user', error, { userId, organizationId })
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to fetch organization membership'
    }
  }
}

/**
 * Create organization membership
 */
export async function createOrganizationMembership(data: {
  userId: string
  organizationId: string
  role: string
}) {
  try {
    logger.debug('Creating organization membership', data)
    
    const membership = await ClerkOrganizationMembershipsModel.createMembership(data)
    
    logger.debug('Organization membership created successfully', { 
      userId: data.userId, 
      organizationId: data.organizationId,
      membershipId: membership.id
    })
    
    return {
      success: true,
      data: membership,
      message: 'Organization membership created successfully'
    }
  } catch (error) {
    logger.error('Failed to create organization membership for user', error, { userId: data.userId, organizationId: data.organizationId })
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to create organization membership'
    }
  }
}

/**
 * Create organization with full onboarding flow
 * 1. Verify user is authenticated
 * 2. Check if organization exists in Supabase with Clerk ID
 * 3. Create organization in Clerk only if Clerk ID doesn't exist
 * 4. Update organization in Supabase with transaction
 * 5. Update user onboarding status to 'client'
 */
export async function updateOrganizationOnboarding(input: CreateOrganizationInput) {
  let userId: string | null = null
  let dbUser: users | null = null
  try {
    // 1. Verify authentication
    const authResult = await auth();
    userId = authResult.userId
    if (!userId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'You must be logged in to create an organization'
      }
    }

    logger.debug('Starting organization onboarding', { 
      userId,
      businessName: input.businessName 
    })

    // 2. Find user in database
    dbUser = await UsersModel.findUserByClerkId(userId)
    if (!dbUser) {
      return {
        success: false,
        error: 'User not found',
        message: 'User not found in database'
      }
    }

    // 3. Check if organization already exists with Clerk ID
    const existingOrg = await OrganizationsModel.findOrganizationByCreator(dbUser.id)
    let clerkOrgId: string | undefined

    if (existingOrg?.organization_clerk_id) {
      // Organization already exists with Clerk ID, use it
      clerkOrgId = existingOrg.organization_clerk_id
      logger.debug('Organization already exists with Clerk ID', { 
        organizationId: existingOrg.id,
        clerkOrgId 
      })
    } else {
      // 4. Create organization in Clerk if Clerk ID doesn't exist
      const organizationData: OrganizationData = {
        businessName: input.businessName,
        businessId: input.businessId || '',
        email: input.email,
        phone: input.phone,
        address: input.address,
        city: input.city,
        state: input.state,
        country: input.country,
        postalCode: input.postalCode,
        clerkUserId: userId
      }

      logger.debug('Creating organization in Clerk', { businessName: input.businessName })
      
      const clerkResult = await ClerkOrganizationMembershipsModel.createClerkOrganization(organizationData)
      
      if (!clerkResult.success || !clerkResult.clerkOrgId) {
        logger.error('Failed to create organization in Clerk', clerkResult.error)
        return {
          success: false,
          error: clerkResult.error || 'Failed to create organization in Clerk',
          message: 'Failed to create organization in Clerk'
        }
      }

      clerkOrgId = clerkResult.clerkOrgId
      logger.debug('Organization created in Clerk successfully', { 
        clerkOrgId 
      })
    }

    // 5. Update organization in Supabase with a single call (also sets Clerk ID if provided)
    logger.debug('Updating organization in Supabase with transaction', {
      organizationId: dbUser.organization_id,
      businessId: input.businessId,
      clerkOrgId
    })

    const updatedOrg = await OrganizationsModel.updateOrganizationOnboarding(
      {
        businessName: input.businessName,
        businessId: input.businessId || '',
        taxId: input.taxId,
        email: input.email,
        phone: input.phone,
        address: input.address,
        city: input.city,
        state: input.state,
        country: input.country,
        postalCode: input.postalCode,
        clerkUserId: userId
      },
      input.email,
      dbUser.name || undefined,
      dbUser.lastname || undefined,
      clerkOrgId
    )

    logger.debug('Organization onboarding completed successfully', {
      organizationId: updatedOrg.id,
      clerkOrgId: updatedOrg.organization_clerk_id ?? clerkOrgId,
      userId: dbUser.id
    })

    return {
      success: true,
      data: {
        organizationId: updatedOrg.id,
        clerkOrgId: updatedOrg.organization_clerk_id ?? clerkOrgId,
        businessName: updatedOrg.business_name
      },
      message: 'Organization created successfully'
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'BUSINESS_ID_TAKEN') {
      logger.warn('Business ID already registered during onboarding', { 
        userId,
        businessId: input.businessId,
        organizationId: dbUser?.organization_id as string | undefined
      })
      return {
        success: false,
        error: 'BUSINESS_ID_TAKEN',
        message: 'This business ID is already registered. Please use a different one or contact support.'
      }
    }
    if (message === 'ORGANIZATION_ID_REQUIRED') {
      logger.warn('User has no organization during onboarding', { userId })
      return {
        success: false,
        error: 'ORGANIZATION_ID_REQUIRED',
        message: 'User has no organization. Complete step 0 first.'
      }
    }
    const isUniqueConstraint = typeof message === 'string' && message.includes('Unique constraint failed')
    if (isUniqueConstraint) {
      logger.warn('Business ID unique constraint during onboarding', { userId })
      return {
        success: false,
        error: 'BUSINESS_ID_TAKEN',
        message: 'This business ID is already registered. Please use a different one or contact support.'
      }
    }

    logger.error('Error creating organization during onboarding', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to create organization'
    }
  }
}


/**
 * Update organization membership role
 */
export async function updateOrganizationMembershipRole(userId: string, organizationId: string, role: string) {
  try {
    logger.debug('Updating organization membership role', { userId, organizationId, role })
    
    const membership = await ClerkOrganizationMembershipsModel.updateMembershipRole(userId, organizationId, role)
    
    logger.debug('Organization membership role updated successfully', { 
      userId, 
      organizationId,
      newRole: role,
      membershipId: membership.id
    })
    
    return {
      success: true,
      data: membership,
      message: 'Organization membership role updated successfully'
    }
  } catch (error) {
    logger.error('Failed to update organization membership role for user', error, { userId, organizationId })
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to update organization membership role'
    }
  }
}

/**
 * Delete organization membership
 */
export async function deleteOrganizationMembership(userId: string, organizationId: string) {
  try {
    logger.debug('Deleting organization membership', { userId, organizationId })
    
    await ClerkOrganizationMembershipsModel.deleteMembership(userId, organizationId)
    
    logger.debug('Organization membership deleted successfully', { 
      userId, 
      organizationId
    })
    
    return {
      success: true,
      data: null,
      message: 'Organization membership deleted successfully'
    }
  } catch (error) {
    logger.error('Failed to delete organization membership for user', error, { userId, organizationId })
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to delete organization membership'
    }
  }
}

/**
 * Check if user has membership in organization
 */
export async function hasOrganizationMembership(userId: string, organizationId: string) {
  try {
    logger.debug('Checking organization membership', { userId, organizationId })
    
    const membership = await ClerkOrganizationMembershipsModel.getMembership(userId, organizationId)
    const hasMembership = !!membership
    
    logger.debug('Organization membership check completed', { 
      userId, 
      organizationId,
      hasMembership
    })
    
    return {
      success: true,
      data: { hasMembership, membership },
      message: 'Organization membership check completed'
    }
  } catch (error) {
    logger.error('Failed to check organization membership for user', error, { userId, organizationId })
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to check organization membership'
    }
  }
}

/**
 * Get user's role in organization
 */
export async function getUserRoleInOrganization(userId: string, organizationId: string) {
  try {
    logger.debug('Getting user role in organization', { userId, organizationId })
    
    const membership = await ClerkOrganizationMembershipsModel.getMembership(userId, organizationId)
    
    if (!membership) {
      return {
        success: false,
        error: 'Membership not found',
        message: 'User is not a member of this organization'
      }
    }
    
    logger.debug('User role retrieved successfully', { 
      userId, 
      organizationId,
      role: membership.role
    })
    
    return {
      success: true,
      data: { role: membership.role, membership },
      message: 'User role retrieved successfully'
    }
  } catch (error) {
    logger.error('Failed to get user role for user', error, { userId, organizationId })
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to get user role'
    }
  }
}
