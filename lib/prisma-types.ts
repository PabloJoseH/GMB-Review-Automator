/**
 * Prisma Type Helpers
 * 
 * This file contains reusable type definitions for Prisma models with relations.
 * Using Prisma.validator ensures type safety and proper inference.
 * 
 * Best Practices:
 * - Use Prisma.validator for complex types with includes/selects
 * - Export types with descriptive names
 * - Keep in sync with schema.prisma structure
 */

import { Prisma } from '@/app/generated/prisma'

// ============================================================================
// USER TYPES
// ============================================================================

/**
 * User with organization relation
 * Used in: user lists, user details, dashboards
 */
export type UserWithOrganization = Prisma.usersGetPayload<{
  include: {
    organizations_users_organization_idToorganizations: {
      include: {
        subscriptions: true
        users_users_organization_idToorganizations: {
          select: {
            id: true
            name: true
            lastname: true
            email: true
            wa_id: true
            role: true
          }
        }
      }
    }
  }
}>

/**
 * User with organization (selected fields only)
 * Optimized for lists and tables
 * Matches the structure returned by UsersModel.findManyWithRelations
 */
export type UserWithOrganizationSummary = Prisma.usersGetPayload<{
  include: {
    organizations_users_organization_idToorganizations: {
      select: {
        id: true
        business_name: true
        organization_clerk_id: true
      }
    }
  }
}>

/**
 * User with organization and location counts
 * Extended type for tables that need to show location statistics
 * Includes both total and active location counts
 */
export type UserWithLocationsCount = UserWithOrganizationSummary & {
  _count?: {
    locations: number
    activeLocations?: number
    sessions?: number
  }
  latestSession?: {
    id: string
    created_at: Date | null
    updated_at: Date | null
  }
}

// ============================================================================
// ORGANIZATION TYPES
// ============================================================================

/**
 * Basic organization type (from Prisma schema)
 * Used in: simple lists, summaries
 */
export type Organization = Prisma.organizationsGetPayload<Record<string, never>>

/**
 * Organization with users relation
 * Used in: organization lists, organization details
 */
export type OrganizationWithUsers = Prisma.organizationsGetPayload<{
  include: {
    users_users_organization_idToorganizations: true
  }
}>

/**
 * Organization with full relations (users, connections, subscriptions)
 * Used in: organization detail pages
 */
export type OrganizationWithRelations = Prisma.organizationsGetPayload<{
  include: {
    users_users_organization_idToorganizations: {
      select: {
        id: true
        email: true
        name: true
        lastname: true
        role: true
        created_at: true
      }
    }
    connections: {
      select: {
        id: true
        provider: true
        external_account_id: true
        created_at: true
      }
    }
    subscriptions: true
  }
}>

/**
 * Organization with subscription details
 * Used in: user detail pages, organization summaries
 */
export type OrganizationWithSubscription = Prisma.organizationsGetPayload<{
  include: {
    subscriptions: true
    users_users_organization_idToorganizations: {
      select: {
        id: true
        name: true
        lastname: true
        email: true
        wa_id: true
        role: true
      }
    }
  }
}>

/**
 * Organization with location counts
 * Extended type for tables that need to show location statistics
 * Includes both total and active location counts
 */
export type OrganizationWithLocationCounts = OrganizationWithRelations & {
  _count?: {
    locations: number
    activeLocations?: number
  }
}

// ============================================================================
// LOCATION TYPES
// ============================================================================

/**
 * Location with connection relation
 * Used in: location lists, location details
 */
export type LocationWithConnection = Prisma.locationsGetPayload<{
  include: {
    connections: {
      include: {
        organizations: {
          include: {
            subscriptions: true
          }
        }
      }
    }
  }
}>

/**
 * Serialized Location with connection relation (Decimal objects converted to numbers)
 * Used in: client components that receive data from server actions
 */
export type SerializedLocationWithConnection = Omit<LocationWithConnection, 'lat' | 'lng'> & {
  lat: number | null
  lng: number | null
}

/**
 * Location with full relations (opening hours, prompt context, users)
 * Used in: location detail pages
 * 
 * Note: example_reviews are excluded as they are fetched separately with pagination.
 * Use _count.example_reviews for total count if needed.
 */
export type LocationWithFullRelations = Prisma.locationsGetPayload<{
  include: {
    connections: {
      include: {
        organizations: {
          include: {
            subscriptions: true
          }
        }
      }
    }
    opening_hours: true
    prompt_context: true
    users_locations_created_byTousers: {
      select: {
        id: true
        name: true
        lastname: true
        email: true
      }
    }
    users_locations_updated_byTousers: {
      select: {
        id: true
        name: true
        lastname: true
        email: true
      }
    }
    _count: {
      select: {
        example_reviews: true
      }
    }
  }
}>

/**
 * Serialized Location with full relations (Decimal objects converted to numbers)
 * Used in: client components that receive data from server actions
 */
export type SerializedLocationWithFullRelations = Omit<LocationWithFullRelations, 'lat' | 'lng'> & {
  lat: number | null
  lng: number | null
}

// ============================================================================
// PAYMENT TYPES
// ============================================================================

/**
 * Serialized Payment (Decimal converted to number)
 * Used in: client components that receive payment data from server
 */
export type SerializedPayment = Omit<Prisma.paymentsGetPayload<Record<string, never>>, 'amount'> & {
  amount: number
}

// ============================================================================
// PROPOSED RESPONSES TYPES
// ============================================================================

/**
 * Proposed response with location data
 * Used in: proposed responses list pages, cards, and components
 * Includes location relation for displaying location name
 */
export type ProposedResponseWithLocation = {
  id: string
  location_id: string | null
  user_id: string | null
  reviewer_name: string | null
  rating: string
  comment: string | null
  create_time: Date | null
  response: string | null
  reply_url: string | null
  created_at: Date | null
  updated_at: Date | null
  location?: {
    id: string
    name: string | null
  } | null
}

// ============================================================================
// SESSION TYPES
// ============================================================================

/**
 * Session with user data, message count, tokens, and last message
 * Used in: conversations table, session lists
 * Matches the structure returned by SessionsModel.findAllWithLastMessage
 */
export type SessionWithUserAndLastMessage = Prisma.sessionsGetPayload<{
  select: {
    id: true
    user_id: true
    conversation_id: true
    agent_managed: true
    active: true
    created_at: true
    updated_at: true
    tokens: true
    _count: {
      select: {
        messages: true
      }
    }
    users: {
      select: {
        id: true
        name: true
        lastname: true
        username: true
        email: true
        wa_id: true
      }
    }
    messages: {
      select: {
        created_at: true
      }
    }
  }
}>
