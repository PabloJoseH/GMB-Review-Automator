import { prisma } from '../../../lib/prisma'
import type { users, sessions, organizations, Prisma } from '../../../app/generated/prisma'
import { OpenAIConversations } from '../openAI/conversation.model'
import { APP_CONSTANTS } from '@/lib/constants'
/**
 * Overview: Users model for Prisma (Supabase)
 * - CRUD helpers for `users` table
 * - Lookups by Clerk ID and internal ID
 */

export const UsersModel = {


  /**
   * check if exists user by ID
   */
  existsUserById: async (userId: string): Promise<boolean> => {
    const user = await prisma.users.findUnique({
      where: { id: userId }
    })
    if (!user) {
      return false
    }
    return true
  },

  /**
   * Find user by Clerk ID
   */
  findUserByClerkId: async (clerkId: string): Promise<users | null> => {
    return prisma.users.findUnique({
      where: { clerk_id: clerkId }
    })
  },

  /**
   * Find user by ID without relations (avoids loading organization/subscriptions).
   * Use for flows that only need user row (e.g. onboarding linking).
   */
  findUserByIdMinimal: async (id: string): Promise<users | null> => {
    return prisma.users.findUnique({
      where: { id }
    })
  },

  /**
   * Find user by ID
   */
  findUserById: async (id: string): Promise<Prisma.usersGetPayload<{
    include: {
      organizations_users_organization_idToorganizations: {
        include: {
          subscriptions: true,
          users_users_organization_idToorganizations: {
            select: {
              id: true,
              name: true,
              lastname: true,
              email: true,
              wa_id: true,
              role: true
            }
          }
        }
      }
    }
  }> | null> => {
    return prisma.users.findUnique({
      where: { id },
      include: {
        organizations_users_organization_idToorganizations: {
          include: {
            subscriptions: true,
            users_users_organization_idToorganizations: {
              select: {
                id: true,
                name: true,
                lastname: true,
                email: true,
                wa_id: true,
                role: true
              }
            }
          }
        }
      }
    })
  },
  /**
   * Find user by WhatsApp ID (wa_id)
   * return user+session+last 10 messages 
   * messages is a include in the sessions table
   * includes active locations created by the user
   */
  findUserByWaId: async (waId: string) => {
    return prisma.users.findUnique({
      where: { wa_id: waId },
      include: {
        sessions: {
          orderBy: { created_at: 'desc' },
          include: {
            messages: {
              orderBy: { created_at: 'desc' },
              take: APP_CONSTANTS.analytics.recentReviewsLimit
            }
          }
        },
        locations_locations_created_byTousers: {
          where: {
            status: 'active'
          },
          select: {
            id: true
          }
        }
      }
    })
  },

  /**
   * get user and organization
   */
  getUserAndOrganization: async (clerkUserId: string) => {
    const userData = await prisma.users.findUnique({
      where: { clerk_id: clerkUserId },
      include: {
        organizations_users_organization_idToorganizations: true
      }
    })
    return { user: userData as users, organization: userData?.organizations_users_organization_idToorganizations as organizations }
  },

  /**
   * Create user
   * also create a session for the user
   */
  createUser: async (data: {
    username: string;
    wa_id: string;
    role: users['role'];
    onboarding_status?: users['onboarding_status'];
    organization_id?: string | null;
    clerk_id?: string | null;
    name?: string | null;
    lastname?: string | null;
    email?: string | null;
  }): Promise<{ user: users, session: sessions }> => {
    const conversationId = await OpenAIConversations.createConversation()
    // create user data with include session data in the same call
    const userData = await prisma.users.create({
      data: {
        ...data,
        onboarding_status: data.onboarding_status || 'user',
        organization_id: data.organization_id || null,
        clerk_id: data.clerk_id || null,
        name: data.name || null,
        lastname: data.lastname || null,
        email: data.email || null,
        sessions: {
          create: {
            conversation_id: conversationId,
            agent_managed: true
          }
        }
      },
      include: {
        sessions: true
      }
    })
    return { user: userData as users, session: userData.sessions[0] as sessions }
  },

  /**
   * update user with empty organization
   * update user with a organization that has only user and mandatory fields
   * Sets user role to OWNER when organization is created
   */
  updateUserWithcreateEmptyOrganization: async (id: string, data: Partial<users>) => {
    return prisma.$transaction(async (tx) => {
      const organization = await tx.organizations.create({
        data: {
          created_by: id,
          // Required fields with default empty values
          first_line_of_address: '',
          city: '',
          zip_code: '',
          country: ''
        }
      })
      return await tx.users.update({
        where: { id: id },
        data: {
          ...data,
        onboarding_status: data.onboarding_status || 'user',
        organization_id: organization.id || null,
        role: 'OWNER', 
        clerk_id: data.clerk_id || null,
        name: data.name || null,
        lastname: data.lastname || null,
        email: data.email || null
        }
      })
    })
  },

  /**
   * Update user
   */
  updateUser: async (id: string, data: Partial<users>) => {
    return prisma.users.update({
      where: { id },
      data
    })
  },

  /**
   * Update user onboarding status
   */
  updateUserOnboardingStatus: async (id: string, onboardingStatus: users['onboarding_status']) => {
    return prisma.users.update({
      where: { id },
      data: { onboarding_status: onboardingStatus }
    })
  },

  /**
   * Update multiple users by organization_id and role
   * Used when deleting an organization to downgrade OWNER users to USER role
   */
  updateManyUsersByOrganizationAndRole: async (
    organizationId: string,
    role: users['role'],
    data: {
      role: users['role']
      onboarding_status: users['onboarding_status']
    }
  ) => {
    return prisma.users.updateMany({
      where: {
        organization_id: organizationId,
        role: role
      },
      data: data
    })
  },

  /**
   * Find many users with relations
   * use includeCount to return the total count of users
   */
  findManyWithRelations: async (
    where: Record<string, unknown>,
    sortBy: string = 'created_at',
    sortOrder: 'asc' | 'desc' = 'desc',
    offset: number = 0,
    limit: number = APP_CONSTANTS.database.batch.defaultLimit,
    includeCount: boolean = false
  ) => {
    if (includeCount) {
      const [users, totalCount] = await Promise.all([
        prisma.users.findMany({
          where,
          include: {
            organizations_users_organization_idToorganizations: {
              select: {
                id: true,
                business_name: true,
                organization_clerk_id: true
              }
            }
          },
          orderBy: { [sortBy]: sortOrder },
          skip: offset,
          take: limit
        }),
        prisma.users.count({ where })
      ])
      return { users: users as users[], totalCount: totalCount as number }
    }

    return prisma.users.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: offset,
      take: limit,
      include: {
        organizations_users_organization_idToorganizations: {
          select: {
            id: true,
            business_name: true,
            organization_clerk_id: true
          }
        }
      }
    })
  },


  count: async (where: Record<string, unknown>) => {
    return prisma.users.count({ where })
  },

  /**
   * Build where clause for users table
   * Includes all search fields: email, name, lastname, clerk_id, username, wa_id, and organization business_name
   * @param params - Search, role, onboarding_status, organization_id, filterInProgress
   * @returns Where clause
   */
  buildWhereClause: (params: {
    search?: string;
    role?: string;
    onboarding_status?: string;
    organization_id?: string;
    filterInProgress?: boolean;
  }) => {
    const { search, role, onboarding_status, organization_id, filterInProgress } = params
    const where: Record<string, unknown> = {}

    // Handle search with ALL fields including wa_id and business_name from the start
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' as const } },
        { name: { contains: search, mode: 'insensitive' as const } },
        { lastname: { contains: search, mode: 'insensitive' as const } },
        { clerk_id: { contains: search } },
        { username: { contains: search, mode: 'insensitive' as const } },
        { wa_id: { contains: search } },
        { 
          organizations_users_organization_idToorganizations: {
            business_name: { contains: search, mode: 'insensitive' as const }
          }
        }
      ]
    }

    if (role) {
      where.role = role
    }

    if (onboarding_status) {
      where.onboarding_status = onboarding_status
    }

    // Handle "inProgress" filter: filter users where onboarding_status != 'done'
    if (filterInProgress) {
      where.onboarding_status = { not: 'done' }
    }

    if (organization_id) {
      where.organization_id = organization_id
    }

    return where
  },

  /**
   * Delete user
   * Note: Owner validation should be done in the action layer before calling this method
   */
  deleteUser: async (id: string) => {
    return prisma.users.delete({
      where: { id }
    })
  },

  /**
   * Get user with organization data for form hydration
   * Optimized single query to get user and organization data together
   */
  getUserWithOrganizationForForm: async (clerkId: string) => {
    return prisma.users.findUnique({
      where: { clerk_id: clerkId },
      include: {
        organizations_users_organization_idToorganizations: {
          select: {
            id: true,
            business_name: true,
            business_id: true,
            email: true,
            primary_phone: true,
            business_address: true,
            first_line_of_address: true,
            city: true,
            region: true,
            zip_code: true,
            country: true,
            tax_identifier: true
          }
        }
      }
    })
  }
}
