/**
 * @fileoverview Users server actions for Supabase.
 *
 * @remarks
 * Handles user CRUD operations, pagination, onboarding flows, and organization-scoped access.
 *
 * Key exports:
 * - `getPaginatedUsers`
 * - `getDashboardUsersTableData`
 * - `getUserById`
 * - `getBasicUserById`
 * - `updateUser`
 * - `deleteUser`
 *
 * Relevant types:
 * - `UsersQueryParams`
 * - `PaginatedUsersResponse`
 * - `DashboardUsersTableDataResponse`
 */
'use server'

import { UsersModel } from '../../models/supabase/users.model'
import type { users } from '../../../app/generated/prisma'
import { createLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import type { PaginatedApiResponse } from '@/lib/api-types'
import { APP_CONSTANTS } from '@/lib/constants'
import type { UserWithOrganizationSummary, UserWithLocationsCount } from '@/lib/prisma-types'
import { getAuthenticatedDatabaseUserId, getAuthenticatedUserAccess, requireServerActionUser } from '@/lib/server-action-auth'
import { checkIfStaff } from '@/lib/auth-helpers'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getTranslations } from 'next-intl/server'

const logger = createLogger('USERS')

async function getUserAccessForAdmin() {
  const { clerkUserId } = await requireServerActionUser()
  const isStaff = await checkIfStaff(clerkUserId)

  if (isStaff) {
    const { dbUserId } = await getAuthenticatedDatabaseUserId()
    return { isStaff, dbUserId, organizationId: undefined as string | undefined }
  }

  const { dbUserId, organizationId } = await getAuthenticatedUserAccess()
  return { isStaff, dbUserId, organizationId: organizationId ?? undefined }
}

/**
 * Overview: Users Server Actions for Supabase
 * - Handles user CRUD operations directly through model layer
 * - Provides pagination and search functionality
 * - Manages user data with organization relations
 * - Follows layered architecture: Action → Model → DB
 * - Uses Prisma-generated types for type safety
 */

export interface UsersQueryParams {
  page: number
  limit: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  role?: users['role']
  onboarding_status?: users['onboarding_status']
  organization_id?: string
  /**
   * Special filter: when true, filters users where onboarding_status != 'done'
   * This is a logical filter (not a direct DB value) used for "inProgress" status
   */
  filterInProgress?: boolean
}

/**
 * Paginated users response
 * Uses Prisma-generated types for maximum type safety
 */
export type PaginatedUsersResponse = PaginatedApiResponse<{
  users: UserWithOrganizationSummary[] | UserWithLocationsCount[]
}>

/**
 * Paginated users response WITH location counts and active sessions
 * Specific type for dashboard users table data
 */
export type DashboardUsersTableDataResponse = PaginatedApiResponse<{
  users: UserWithLocationsCount[]
}>

/**
 * Build where clause for user queries with search and filtering
 */
function buildWhereClause(params: UsersQueryParams) {
  return UsersModel.buildWhereClause({
    search: params.search,
    role: params.role,
    onboarding_status: params.onboarding_status,
    organization_id: params.organization_id,
    filterInProgress: params.filterInProgress
  })
}

/**
 * Get paginated users with search and filtering
 * Lightweight version WITHOUT location counts (use getDashboardUsersTableData for dashboard table)
 */
export async function getPaginatedUsers(params: UsersQueryParams): Promise<PaginatedUsersResponse> {
  try {
    const { isStaff, organizationId } = await getUserAccessForAdmin()
    if (!isStaff && !organizationId) {
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
        message: 'Unauthorized user access',
        error: 'Organization access required'
      }
    }

    if (!isStaff && params.organization_id && params.organization_id !== organizationId) {
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
        message: 'Unauthorized user access',
        error: 'Forbidden organization access'
      }
    }

    logger.debug('Getting paginated users', {
      page: params.page,
      limit: params.limit,
      search: params.search,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      role: params.role,
      onboarding_status: params.onboarding_status,
      organization_id: organizationId
    })

    const offset = (params.page - 1) * params.limit
    const scopedOrganizationId = isStaff ? params.organization_id : organizationId
    const where = buildWhereClause({ ...params, organization_id: scopedOrganizationId })
    const sortBy = params.sortBy || 'created_at'
    const sortOrder = params.sortOrder || 'desc'

    // Lightweight query - only basic user + organization data
    const [users, totalCount] = await Promise.all([
      prisma.users.findMany({
        where,
        include: {
          organizations_users_organization_idToorganizations: {
            select: {
              id: true,
              business_name: true,
              organization_clerk_id: true,
            }
          }
        },
        orderBy: { [sortBy]: sortOrder },
        skip: offset,
        take: params.limit
      }),
      prisma.users.count({ where })
    ])

    const totalPages = Math.ceil(totalCount / params.limit)
    const hasNext = params.page < totalPages
    const hasPrev = params.page > 1

    const result: PaginatedUsersResponse = {
      success: true,
      data: {
        users
      },
      pagination: {
        page: params.page,
        limit: params.limit,
        total: totalCount,
        totalPages,
        hasNext,
        hasPrev
      },
      message: 'Users retrieved successfully'
    }

    logger.debug('Users retrieved successfully', {
      totalUsers: result.pagination.total,
      currentPage: result.pagination.page,
      totalPages: result.pagination.totalPages
    })

    return result

  } catch (error) {
    logger.error('Failed to get paginated users', error)
    
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
      message: 'Failed to retrieve users',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Get paginated users data for dashboard users table
 * Returns users with location counts (active and total) and active sessions
 * 
 * This function is specifically designed for the dashboard users table view,
 * which requires enriched user data including:
 * - Organization information
 * - Location counts per organization (total and active)
 * - Latest active session per user
 * 
 * Strategy:
 * 🔹 Single Promise.all with all data needed in one efficient query
 * - Fetch users with full relation hierarchy (organizations → connections → locations)
 * - Include only active sessions per user
 * - Process all data in memory with minimal operations
 */
export async function getDashboardUsersTableData(params: UsersQueryParams): Promise<DashboardUsersTableDataResponse> {
  try {
    const { isStaff, organizationId } = await getUserAccessForAdmin()
    if (!isStaff && !organizationId) {
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
        message: 'Unauthorized user access',
        error: 'Organization access required'
      }
    }

    if (!isStaff && params.organization_id && params.organization_id !== organizationId) {
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
        message: 'Unauthorized user access',
        error: 'Forbidden organization access'
      }
    }

    logger.debug('Getting dashboard users table data', {
      page: params.page,
      limit: params.limit,
    })

    const offset = (params.page - 1) * params.limit
    const scopedOrganizationId = isStaff ? params.organization_id : organizationId
    const where = buildWhereClause({ ...params, organization_id: scopedOrganizationId })
    const sortBy = params.sortBy || 'created_at'
    const sortOrder = params.sortOrder || 'desc'

    // 🔹 Single Promise.all to fetch every required relation
    const [usersData, totalCount] = await Promise.all([
      prisma.users.findMany({
        where,
        include: {
          // Include the entire relationship hierarchy
          organizations_users_organization_idToorganizations: {
            select: {
              id: true,
              business_name: true,
              organization_clerk_id: true,
              connections: {
                select: {
                  id: true,
                  locations: {
                    select: {
                      id: true,
                      status: true,
                    },
                  },
                },
              },
            },
          },
          // Include only the most recent active session
          sessions: {
            where: { active: true },
            orderBy: { created_at: 'desc' },
            take: 1,
            select: {
              id: true,
              user_id: true,
              created_at: true,
              updated_at: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: offset,
        take: params.limit,
      }),
      prisma.users.count({ where }),
    ])

    // 🔹 Process data in memory
    const usersWithCounts = usersData.map((user) => {
      const org = user.organizations_users_organization_idToorganizations

      const connections = org?.connections || []

      // Aggregate locations from every connection
      const allLocations = connections.flatMap((c) => c.locations)

      const totalLocations = allLocations.length
      const activeLocations = allLocations.filter((l) => l.status === 'active').length

      const latestSession = user.sessions[0]

      return {
        id: user.id,
        username: user.username,
        name: user.name,
        lastname: user.lastname,
        email: user.email,
        role: user.role,
        wa_id: user.wa_id,
        clerk_id: user.clerk_id,
        onboarding_status: user.onboarding_status,
        reference: user.reference,
        created_at: user.created_at,
        updated_at: user.updated_at,
        organization_id: user.organization_id,
        organizations_users_organization_idToorganizations: org
          ? {
              id: org.id,
              business_name: org.business_name,
              organization_clerk_id: org.organization_clerk_id,
            }
          : null,
        _count: {
          locations: totalLocations,
          activeLocations,
        },
        latestSession: latestSession
          ? {
              id: latestSession.id,
              created_at: latestSession.created_at,
              updated_at: latestSession.updated_at,
            }
          : undefined,
      }
    })

    // 🔹 Pagination
    const totalPages = Math.ceil(totalCount / params.limit)
    const result: DashboardUsersTableDataResponse = {
      success: true,
      data: {
        users: usersWithCounts as UserWithLocationsCount[],
      },
      pagination: {
        page: params.page,
        limit: params.limit,
        total: totalCount,
        totalPages,
        hasNext: params.page < totalPages,
        hasPrev: params.page > 1,
      },
      message: 'Dashboard users table data retrieved successfully',
    }

    logger.debug('Dashboard users table data retrieved', {
      totalUsers: totalCount,
      currentPage: params.page,
      usersInPage: usersWithCounts.length,
    })

    return result

  } catch (error) {
    logger.error('Failed to get dashboard users table data', error)
    
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
      message: 'Failed to retrieve dashboard users table data',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * Check if exists user by WhatsApp ID
 */
export async function existsUserById(userId: string) {
  try {
    logger.debug('Checking if user exists by WhatsApp ID', { userId })

    const exists = await UsersModel.existsUserById(userId)

    if (!exists) {
      return {
        exists: false,
        message: 'No user found with this WhatsApp ID'
      }
    }

    return {
      exists: true,
      message: 'User found with this WhatsApp ID'
    }

  } catch (error) {
    logger.error('Failed to check if user exists by WhatsApp ID', error)
    
    return {
      exists: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to check if user exists by WhatsApp ID'
    }
  }
}

/**
 * Result of authentication parameter validation
 */
export interface AuthValidationResult {
  isValid: boolean
  error?: string
  userId?: string
  message?: string
}

/**
 * Validates authentication parameters from WhatsApp integration
 * 
 * The userId must be provided, valid, and exist in the database for the 
 * registration process to continue. Valid userId format: alphanumeric 
 * characters, hyphens, and underscores only.
 * 
 * @param locale - Current application locale (e.g., 'en', 'es')
 * @param userId - REQUIRED user ID from query param (?u=userId)
 * @returns Promise<Validation result with userId if valid, error code if invalid>
 * 
 * @example
 * // Valid userId that exists in database
 * const result = await validateAuthParams('en', 'user123');
 * // { isValid: true, userId: 'user123' }
 * 
 * @example
 * // Missing userId
 * const result = await validateAuthParams('en', undefined);
 * // { isValid: false, error: 'missing_user_id' }
 * 
 * @example
 * // Invalid format
 * const result = await validateAuthParams('en', 'user@email');
 * // { isValid: false, error: 'invalid_user_id_format' }
 * 
 * @example
 * // userId doesn't exist in database
 * const result = await validateAuthParams('en', 'nonexistent_user');
 * // { isValid: false, error: 'user_not_found' }
 */
export async function validateAuthParams(locale: string, userId?: string): Promise<AuthValidationResult> {
  // Load translations for error messages
  const t = await getTranslations({ locale, namespace: 'auth.errors' })

  // userId is REQUIRED
  if (!userId) {
    return {
      isValid: false,
      error: 'missing_user_id',
      message: t('missing_user_id_description'),
    }
  }

  // Validate that userId is a non-empty string
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return {
      isValid: false,
      error: 'invalid_user_id',
      message: t('invalid_user_id_description'),
    }
  }

  // Validate length (between 1 and 255 characters)
  if (userId.length > 255) {
    return {
      isValid: false,
      error: 'user_id_too_long',
      message: t('user_id_too_long_description'),
    }
  }

  // Validate allowed characters (alphanumeric, hyphens, underscores)
  const validPattern = /^[a-zA-Z0-9_-]+$/
  if (!validPattern.test(userId)) {
    return {
      isValid: false,
      error: 'invalid_user_id_format',
      message: t('invalid_user_id_format_description'),
    }
  }

  // Validate that userId is not authenticated user, if it is, return error
  const { userId: authenticatedUserId } = await auth()
  if (authenticatedUserId) {
    return {
      isValid: false,
      error: 'user_is_authenticated',
      userId: userId.trim(), // Include userId for reauth flow
      message: t('user_is_authenticated_description'),
    }
  }

  // Check if user exists in database
  try {
    const userExists = await existsUserById(userId.trim())
    
    if (!userExists.exists) {
      return {
        isValid: false,
        error: 'user_not_found',
        message: t('user_not_found_description'),
      }
    }
  } catch (error) {
    logger.error('Error checking user existence in database:', error)
    return {
      isValid: false,
      error: 'database_check_failed',
      message: t('database_check_failed_description'),
    }
  }

  return {
    isValid: true,
    userId: userId.trim(),
  }
}

/**
 * Get user by ID without loading organization/subscriptions.
 * Use when only the user row is needed (e.g. onboarding linking).
 */
export async function getBasicUserById(id: string) {
  try {
    logger.debug('Getting basic user by ID', { userId: id })
    const user = await UsersModel.findUserByIdMinimal(id)
    if (!user) {
      return { success: false as const, error: 'User not found', message: 'No user found with this ID' }
    }
    return { success: true as const, data: user, message: 'User retrieved successfully' }
  } catch (error) {
    logger.error(`Failed to get basic user by ID ${id}`, error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve user'
    }
  }
}

/**
 * Get user by ID
 */
export async function getUserById(id: string) {
  try {
    logger.debug('Getting user by ID', { userId: id })

    const user = await UsersModel.findUserById(id)

    if (!user) {
      return {
        success: false,
        error: 'User not found',
        message: 'No user found with this ID'
      }
    }

    logger.debug('User retrieved successfully', {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    })

    return {
      success: true,
      data: user,
      message: 'User retrieved successfully'
    }

  } catch (error) {
    logger.error(`Failed to get user by ID ${id}`, error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve user'
    }
  }
}

/**
 * Get user by Clerk ID
 */
export async function getUserByClerkId(clerkId: string) {
  try {
    logger.debug('Getting user by Clerk ID', { clerkId })

    const user = await UsersModel.findUserByClerkId(clerkId)

    if (!user) {
      return {
        success: false,
        error: 'User not found',
        message: 'No user found with this Clerk ID'
      }
    }

    logger.debug('User retrieved successfully', {
      userId: user.id,
      clerkId: user.clerk_id,
      username: user.username,
      email: user.email,
      role: user.role
    })

    return {
      success: true,
      data: user,
      message: 'User retrieved successfully'
    }

  } catch (error) {
    logger.error(`Failed to get user by Clerk ID ${clerkId}`, error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve user'
    }
  }
}

/**
 * Create a new user
 */
export async function createUser(userData: {
  username: string
  wa_id: string
  role: users['role']
  onboarding_status?: users['onboarding_status']
  organization_id?: string | null
  clerk_id?: string | null
  name?: string | null
  lastname?: string | null
  email?: string | null
}) {
  try {
    logger.debug('Creating new user', {
      username: userData.username,
      role: userData.role,
      organization_id: userData.organization_id,
      clerk_id: userData.clerk_id
    })

    const { user, session } = await UsersModel.createUser(userData)

    logger.debug('User created successfully', {
      userId: user.id,
      username: user.username,
      role: user.role,
      onboarding_status: user.onboarding_status
    })

    return {
      success: true,
      data: { user, session },
      message: 'User created successfully'
    }

  } catch (error) {
    logger.error('Failed to create user', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to create user'
    }
  }
}

/**
 * Update user information
 */
export async function updateUser(id: string, userData: Partial<{
  username: string
  wa_id: string
  role: users['role']
  onboarding_status: users['onboarding_status']
  organization_id: string | null
  clerk_id: string | null
  name: string | null
  lastname: string | null
  email: string | null
}>) {
  try {
    const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)
    if (!isStaff && dbUserId !== id) {
      return {
        success: false,
        error: 'Forbidden user access',
        message: 'Unauthorized user access'
      }
    }

    logger.debug('Updating user', {
      userId: id,
      updateFields: Object.keys(userData)
    })

    const user = await UsersModel.updateUser(id, userData)

    logger.debug('User updated successfully', {
      userId: user.id,
      username: user.username,
      role: user.role,
      onboarding_status: user.onboarding_status
    })

    return {
      success: true,
      data: user,
      message: 'User updated successfully'
    }

  } catch (error) {
    logger.error(`Failed to update user ${id}`, error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to update user'
    }
  }
}

/**
 * Get users by organization ID
 */
export async function getUsersByOrganization(organizationId: string, params?: Partial<UsersQueryParams>) {
  try {
    const { isStaff, organizationId: authenticatedOrganizationId } = await getUserAccessForAdmin()
    if (!isStaff && (!authenticatedOrganizationId || authenticatedOrganizationId !== organizationId)) {
      return {
        success: false,
        error: 'Forbidden organization access',
        message: 'Unauthorized user access'
      }
    }

    logger.debug('Getting users by organization', {
      organizationId,
      page: params?.page,
      limit: params?.limit,
      search: params?.search
    })

    const queryParams: UsersQueryParams = {
      page: params?.page || APP_CONSTANTS.database.query.defaultPage,
      limit: params?.limit || APP_CONSTANTS.database.pagination.defaultLimit,
      organization_id: isStaff ? organizationId : authenticatedOrganizationId,
      search: params?.search,
      sortBy: params?.sortBy,
      sortOrder: params?.sortOrder,
      role: params?.role,
      onboarding_status: params?.onboarding_status
    }

    const result = await getPaginatedUsers(queryParams)

    if (!result.success) {
      return result
    }

    logger.debug('Organization users retrieved successfully', {
      organizationId,
      totalUsers: result.pagination.total,
      currentPage: result.pagination.page
    })

    return {
      success: true,
      data: result.data?.users || [],
      message: 'Organization users retrieved successfully'
    }

  } catch (error) {
    logger.error(`Failed to get users for organization ${organizationId}`, error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve organization users'
    }
  }
}

/**
 * Get users by role
 */
export async function getUsersByRole(role: users['role'], params?: Partial<UsersQueryParams>) {
  try {
    const { isStaff, organizationId } = await getUserAccessForAdmin()
    if (!isStaff && !organizationId) {
      return {
        success: false,
        error: 'Organization access required',
        message: 'Unauthorized user access'
      }
    }

    logger.debug('Getting users by role', {
      role,
      page: params?.page,
      limit: params?.limit,
      search: params?.search
    })

    const queryParams: UsersQueryParams = {
      page: params?.page || APP_CONSTANTS.database.query.defaultPage,
      limit: params?.limit || APP_CONSTANTS.database.pagination.defaultLimit,
      role,
      search: params?.search,
      sortBy: params?.sortBy,
      sortOrder: params?.sortOrder,
      onboarding_status: params?.onboarding_status,
      organization_id: isStaff ? undefined : organizationId
    }

    const result = await getPaginatedUsers(queryParams)

    if (!result.success) {
      return result
    }

    logger.debug('Users by role retrieved successfully', {
      role,
      totalUsers: result.pagination.total,
      currentPage: result.pagination.page
    })

    return {
      success: true,
      data: result.data?.users || [],
      message: 'Users by role retrieved successfully'
    }

  } catch (error) {
    logger.error(`Failed to get users by role ${role}`, error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve users by role'
    }
  }
}

/**
 * Get users by onboarding status
 */
export async function getUsersByOnboardingStatus(
  onboardingStatus: users['onboarding_status'],
  params?: Partial<UsersQueryParams>
) {
  try {
    const { isStaff, organizationId } = await getUserAccessForAdmin()
    if (!isStaff && !organizationId) {
      return {
        success: false,
        error: 'Organization access required',
        message: 'Unauthorized user access'
      }
    }

    logger.debug('Getting users by onboarding status', {
      onboardingStatus,
      page: params?.page,
      limit: params?.limit,
      search: params?.search
    })

    const queryParams: UsersQueryParams = {
      page: params?.page || APP_CONSTANTS.database.query.defaultPage,
      limit: params?.limit || APP_CONSTANTS.database.pagination.defaultLimit,
      onboarding_status: onboardingStatus,
      search: params?.search,
      sortBy: params?.sortBy,
      sortOrder: params?.sortOrder,
      role: params?.role,
      organization_id: isStaff ? undefined : organizationId
    }

    const result = await getPaginatedUsers(queryParams)

    if (!result.success) {
      return result
    }

    logger.debug('Users by onboarding status retrieved successfully', {
      onboardingStatus,
      totalUsers: result.pagination.total,
      currentPage: result.pagination.page
    })

    return {
      success: true,
      data: result.data?.users || [],
      message: 'Users by onboarding status retrieved successfully'
    }

  } catch (error) {
    logger.error(`Failed to get users by onboarding status ${onboardingStatus}`, error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve users by onboarding status'
    }
  }
}

/**
 * Delete user
 * Deletes user from Clerk first if clerk_id exists, then from database
 * Ensures data consistency between Clerk and database
 * 
 * Process:
 * 1. Get user from database to check role and clerk_id
 * 2. If user is OWNER, prevent deletion and return error
 * 3. If clerk_id exists, delete from Clerk first
 * 4. Delete from database (always, even if Clerk deletion fails for non-critical errors)
 * 5. Returns success only if database deletion succeeds
 */
export async function deleteUser(id: string) {
  try {
    const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)
    if (!isStaff && dbUserId !== id) {
      return {
        success: false,
        error: 'Forbidden user access',
        message: 'Unauthorized user access'
      }
    }

    logger.debug('Deleting user', { userId: id })

    // Get user first to check role and clerk_id
    const user = await UsersModel.findUserById(id)
    
    if (!user) {
      return {
        success: false,
        error: 'User not found',
        message: 'No user found with this ID'
      }
    }

    // Prevent deletion of OWNER users
    if (user.role === 'OWNER') {
      logger.warn('Attempted to delete user with OWNER role', { 
        userId: user.id,
        username: user.username 
      })
      return {
        success: false,
        error: 'Cannot delete user with OWNER role',
        message: 'Cannot delete user with OWNER role'
      }
    }

    // If user has clerk_id, delete from Clerk first
    if (user.clerk_id) {
      try {
        const client = await clerkClient()
        await client.users.deleteUser(user.clerk_id)
        logger.debug('User deleted from Clerk successfully', { 
          clerkId: user.clerk_id,
          userId: user.id
        })
      } catch (clerkError) {
        // Handle Clerk deletion errors
        // If user doesn't exist in Clerk (404), continue with DB deletion
        // For other errors, log warning but still continue with DB deletion
        const errorMessage = clerkError instanceof Error ? clerkError.message : 'Unknown error'
        const isNotFoundError = 
          errorMessage.toLowerCase().includes('not found') || 
          errorMessage.toLowerCase().includes('404') ||
          (clerkError && typeof clerkError === 'object' && 'status' in clerkError && clerkError.status === 404)
        
        if (isNotFoundError) {
          logger.debug('User not found in Clerk (may already be deleted), continuing with DB deletion', { 
            clerkId: user.clerk_id,
            userId: user.id
          })
        } else {
          logger.debug('Failed to delete user from Clerk, continuing with DB deletion', { 
            clerkId: user.clerk_id,
            userId: user.id,
            error: errorMessage
          })
        }
        // Continue with DB deletion even if Clerk deletion fails
        // This ensures the user is removed from our database regardless
      }
    } else {
      logger.debug('User has no clerk_id, skipping Clerk deletion', { userId: user.id })
    }

    // Delete from database (always attempt, even if Clerk deletion failed)
    const deletedUser = await UsersModel.deleteUser(id)

    logger.debug('User deleted successfully from database', { 
      userId: deletedUser.id,
      username: deletedUser.username,
      hadClerkId: !!user.clerk_id
    })

    return {
      success: true,
      data: deletedUser,
      message: 'User deleted successfully'
    }

  } catch (error) {
    logger.error('Error deleting user', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error deleting user',
      message: 'Error deleting user'
    }
  }
}

/**
 * Update user onboarding status
 */
export async function updateUserOnboardingStatus(id: string, onboardingStatus: users['onboarding_status']) {
  try {
    const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)
    if (!isStaff && dbUserId !== id) {
      return {
        success: false,
        error: 'Forbidden user access',
        message: 'Unauthorized user access'
      }
    }

    logger.debug('Updating user onboarding status', { userId: id, onboardingStatus })

    const user = await UsersModel.updateUserOnboardingStatus(id, onboardingStatus)

    logger.debug('User onboarding status updated successfully', { userId: user.id, onboardingStatus: user.onboarding_status })

    return {
      success: true,
      data: user,
      message: 'User onboarding status updated successfully'
    }
  } catch (error) {
    logger.error('Error updating user onboarding status', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error updating user onboarding status',
      message: 'Error updating user onboarding status'
    }
  }
}

/**
 * Get organization data for form hydration
 * Used when user goes back to step-1 to pre-fill the form
 * Optimized with single database query
 */
export async function getOrganizationDataForForm(userId: string) {
  try {
    // Here userId represents the Clerk user ID (clerk_id),
    // because this function is called from onboarding using clerkUser.id.
    const targetUser = await UsersModel.findUserByClerkId(userId)
    if (!targetUser) {
      return {
        success: false,
        error: 'User not found',
        message: 'User not found in database'
      }
    }

    logger.debug('Getting organization data for form hydration (optimized)', { userId })
    
    // Single optimized query to get user with organization data
    const userWithOrg = await UsersModel.getUserWithOrganizationForForm(userId)
    
    if (!userWithOrg) {
      return {
        success: false,
        error: 'User not found',
        message: 'User not found in database'
      }
    }

    // Check if user has an organization
    if (!userWithOrg.organization_id || !userWithOrg.organizations_users_organization_idToorganizations) {
      return {
        success: false,
        error: 'No organization found',
        message: 'User does not have an organization'
      }
    }

    const organization = userWithOrg.organizations_users_organization_idToorganizations

    // Use individual address fields from database, fallback to parsing business_address if needed
    let address = organization.first_line_of_address || ''
    let city = organization.city || ''
    let state = organization.region || ''
    let country = organization.country || ''
    let postalCode = organization.zip_code || ''

    // Fallback: if individual fields are empty but business_address exists, parse it
    if (!address && !city && organization.business_address) {
      const addressParts = organization.business_address.split(',').map(part => part.trim())
      
      if (addressParts.length >= 4) {
        address = addressParts[0] || ''
        city = addressParts[1] || ''
        state = addressParts[2] || ''
        const lastPart = addressParts[3] || ''
        
        // Extract country and postal code from last part
        const countryPostalMatch = lastPart.match(/^(.+?)\s+(\d+.*)$/)
        if (countryPostalMatch) {
          country = countryPostalMatch[1].trim()
          postalCode = countryPostalMatch[2].trim()
        } else {
          country = lastPart
        }
      }
    }

    logger.debug('Organization data retrieved successfully (optimized)', { 
      userId, 
      organizationId: organization.id,
      businessName: organization.business_name,
      queryType: 'single_optimized'
    })
    
    return {
      success: true,
      data: {
        businessName: organization.business_name || '',
        businessId: organization.business_id || '',
        taxId: organization.tax_identifier || '',
        email: organization.email || '',
        phone: organization.primary_phone || '',
        address,
        city,
        state,
        country,
        postalCode
      },
      message: 'Organization data retrieved successfully'
    }
  } catch (error) {
    logger.error('Failed to get organization data for form (optimized)', error, { userId })
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to get organization data'
    }
  }
}