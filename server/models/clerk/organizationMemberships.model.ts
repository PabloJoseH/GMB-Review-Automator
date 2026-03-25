/**
 * Overview: Clerk Organization Memberships model
 * - Handles organization membership operations
 * - Fetches user memberships from Clerk API
 * - Creates and deletes organizations in Clerk
 * - Provides type-safe interfaces for membership data
 */

import { createLogger } from '@/lib/logger'
import { APP_CONSTANTS } from '@/lib/constants'

const logger = createLogger('ClerkOrganizationMembershipsModel')

// Define specific types for metadata to avoid 'any' usage

export type ClerkMetadata = Record<string, string | number | boolean | null | undefined>

export interface OrganizationData {
  businessName: string
  businessId?: string
  taxId?: string
  email: string
  phone?: string
  address: string
  city: string
  state: string
  country: string
  postalCode: string
  clerkUserId: string
}

export type ClerkOrganizationMembership = {
  id: string
  organization: {
    id: string
    name: string
    slug: string
    image_url?: string
    has_image: boolean
    created_at: number
    updated_at: number
    public_metadata: ClerkMetadata
    private_metadata: ClerkMetadata
  }
  role: string
  public_metadata: ClerkMetadata
  private_metadata: ClerkMetadata
  created_at: number
  updated_at: number
  public_user_data: {
    user_id: string
    first_name?: string
    last_name?: string
    image_url?: string
    has_image: boolean
    identifier: string
  }
}

export interface CreateOrganizationInput {
  businessName: string
  businessId?: string
  taxId?: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  country: string
  postalCode: string
}

export type ClerkMembershipsResponse = {
  data: ClerkOrganizationMembership[]
  total_count: number
}

// Simplified interface for basic membership operations
interface ClerkMembership {
  id: string
  organization: {
    id: string
    name: string
    slug: string
  }
  role: string
  created_at: number
  updated_at: number
}

export const ClerkOrganizationMembershipsModel = {
  /**
   * Fetch organization memberships for a user from Clerk API
   */
  fetchMemberships: async (userId: string): Promise<ClerkMembership[]> => {
    const secret = process.env.CLERK_SECRET_KEY
    if (!secret) {
      logger.error('CLERK_SECRET_KEY missing for organization-memberships endpoint')
      throw new Error('Server configuration error: Missing Clerk secret key')
    }

    const baseUrl = `${APP_CONSTANTS.clerk.api.baseUrl}/users/${encodeURIComponent(userId)}/organization_memberships`
    
    try {
      const memberships: ClerkMembership[] = []
      const limit = 100
      let offset = 0

      while (true) {
        const url = `${baseUrl}?limit=${limit}&offset=${offset}`
        const resp = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${secret}`,
            'Content-Type': 'application/json'
          }
        })

        if (!resp.ok) {
          const text = await resp.text()
          logger.error(`Failed to load Clerk organization memberships: Status ${resp.status}: ${text}`)
          throw new Error(`Clerk API Error ${resp.status}`)
        }

        const payload = (await resp.json()) as Partial<ClerkMembershipsResponse>
        const page = payload?.data ?? []
        const totalCount = typeof payload?.total_count === 'number' ? payload.total_count : null

        memberships.push(...(page as ClerkMembership[]))

        if (page.length === 0) break
        offset += page.length
        if (totalCount !== null && offset >= totalCount) break
        if (page.length < limit) break
      }

      return memberships
    } catch (error) {
      logger.error('Error fetching organization memberships:', error)
      throw error
    }
  },

  /**
   * Create organization in Clerk
   */
  createClerkOrganization: async (data: OrganizationData): Promise<{ success: boolean; clerkOrgId?: string; error?: string }> => {
    try {
      logger.debug('Creating organization in Clerk', { 
        businessName: data.businessName,
        clerkUserId: data.clerkUserId 
      })

      const secret = process.env.CLERK_SECRET_KEY
      if (!secret) {
        logger.error('CLERK_SECRET_KEY missing for organization creation')
        return { success: false, error: 'Server configuration error: Missing Clerk secret key' }
      }

      // Generate unique slug
      const timestamp = Date.now().toString().slice(-6)
      const randomSuffix = Math.random().toString(36).substring(2, 8)
      const baseSlug = data.businessName.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()
      
      const uniqueSlug = `${baseSlug}-${timestamp}-${randomSuffix}`

      const organizationPayload = {
        name: data.businessName,
        slug: uniqueSlug,
        created_by: data.clerkUserId,
        // Store business data in public metadata
        public_metadata: {
          business_id: data.businessId,
          email: data.email,
          phone: data.phone,
          address: data.address,
          city: data.city,
          state: data.state,
          country: data.country,
          postal_code: data.postalCode
        }
      }

      const response = await fetch(`${APP_CONSTANTS.clerk.api.baseUrl}/organizations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(organizationPayload)
      })

      if (response.ok) {
        const clerkOrg = await response.json()
        logger.debug('Organization created in Clerk', { 
          clerkOrgId: clerkOrg.id,
          name: clerkOrg.name,
          slug: clerkOrg.slug
        })
        return { success: true, clerkOrgId: clerkOrg.id }
      } else {
        const errorText = await response.text()
        logger.error(`Failed to create organization in Clerk: ${errorText} (Status: ${response.status})`)
        return { success: false, error: `Clerk API Error ${response.status}: ${errorText}` }
      }

    } catch (error) {
      logger.error('Clerk organization creation failed:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  },

  /**
   * Get organization membership by user ID and organization ID
   */
  getMembership: async (userId: string, organizationId: string): Promise<ClerkOrganizationMembership | null> => {
    try {
      const memberships = await ClerkOrganizationMembershipsModel.fetchMemberships(userId)
      const membership = memberships.find((m) => m.organization?.id === organizationId)
      return (membership as unknown as ClerkOrganizationMembership) ?? null
    } catch (error) {
      logger.error('Error getting organization membership:', error)
      throw error
    }
  },

  /**
   * Create organization membership
   */
  createMembership: async (data: {
    userId: string
    organizationId: string
    role: string
  }): Promise<ClerkOrganizationMembership> => {
    try {
      const secret = process.env.CLERK_SECRET_KEY
      if (!secret) {
        logger.error('CLERK_SECRET_KEY missing for createMembership')
        throw new Error('Server configuration error: Missing Clerk secret key')
      }

      const url = `${APP_CONSTANTS.clerk.api.baseUrl}/organizations/${encodeURIComponent(data.organizationId)}/memberships`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: data.userId,
          role: data.role
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Failed to create membership: ${errorText} (Status: ${response.status})`)
        throw new Error(`Clerk API Error ${response.status}: ${errorText}`)
      }

      const membership = await response.json()
      logger.debug('Membership created successfully', { 
        userId: data.userId, 
        organizationId: data.organizationId, 
        role: data.role 
      })
      
      return membership
    } catch (error) {
      logger.error('Error creating organization membership:', error)
      throw error
    }
  },

  /**
   * Update organization membership role
   */
  updateMembershipRole: async (userId: string, organizationId: string, role: string): Promise<ClerkOrganizationMembership> => {
    try {
      const secret = process.env.CLERK_SECRET_KEY
      if (!secret) {
        logger.error('CLERK_SECRET_KEY missing for updateMembershipRole')
        throw new Error('Server configuration error: Missing Clerk secret key')
      }

      const url = `${APP_CONSTANTS.clerk.api.baseUrl}/organizations/${encodeURIComponent(organizationId)}/memberships/${encodeURIComponent(userId)}`
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${secret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: role
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Failed to update membership role: ${errorText} (Status: ${response.status})`)
        throw new Error(`Clerk API Error ${response.status}: ${errorText}`)
      }

      const membership = await response.json()
      logger.debug('Membership role updated successfully', { 
        userId, 
        organizationId, 
        newRole: role 
      })
      
      return membership
    } catch (error) {
      logger.error('Error updating organization membership role:', error)
      throw error
    }
  },

  /**
   * Delete organization membership
   */
  deleteMembership: async (userId: string, organizationId: string): Promise<void> => {
    try {
      const secret = process.env.CLERK_SECRET_KEY
      if (!secret) {
        logger.error('CLERK_SECRET_KEY missing for deleteMembership')
        throw new Error('Server configuration error: Missing Clerk secret key')
      }

      const url = `${APP_CONSTANTS.clerk.api.baseUrl}/organizations/${encodeURIComponent(organizationId)}/memberships/${encodeURIComponent(userId)}`
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${secret}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Failed to delete membership: ${errorText} (Status: ${response.status})`)
        throw new Error(`Clerk API Error ${response.status}: ${errorText}`)
      }

      logger.debug('Membership deleted successfully', { userId, organizationId })
    } catch (error) {
      logger.error('Error deleting organization membership:', error)
      throw error
    }
  },

  /**
   * Delete organization from Clerk
   */
  deleteClerkOrganization: async (clerkOrgId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const secret = process.env.CLERK_SECRET_KEY
      if (!secret) {
        logger.error('CLERK_SECRET_KEY missing for organization deletion')
        return { success: false, error: 'Server configuration error: Missing Clerk secret key' }
      }

      const url = `${APP_CONSTANTS.clerk.api.baseUrl}/organizations/${encodeURIComponent(clerkOrgId)}`
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${secret}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok || response.status === APP_CONSTANTS.clerk.errors.notFoundStatusCode) {
        // 404 means organization already deleted, which is fine
        logger.debug('Organization deleted from Clerk successfully', { clerkOrgId })
        return { success: true }
      } else {
        const errorText = await response.text()
        logger.error(`Failed to delete organization from Clerk: ${errorText} (Status: ${response.status})`)
        return { success: false, error: `Clerk API Error ${response.status}: ${errorText}` }
      }
    } catch (error) {
      logger.error('Error deleting organization from Clerk:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}
