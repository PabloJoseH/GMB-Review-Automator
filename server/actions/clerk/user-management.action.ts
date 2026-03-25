'use server'

import { clerkClient } from '@clerk/nextjs/server'
import { createLogger } from '@/lib/logger'
import { APP_CONSTANTS } from '@/lib/constants'
import { deleteUser as deleteUserFromDB } from '@/server/actions/supabase/users.action'
import type { PaginatedApiResponse } from '@/lib/api-types'

const logger = createLogger('CLERK_USER_MANAGEMENT')

/**
 * Get user status from Clerk
 */
export async function getUserStatus(userId: string): Promise<PaginatedApiResponse<{
  banned: boolean
  locked: boolean
}>> {
  try {
    logger.debug('Getting user status from Clerk', { userId })

    const client = await clerkClient()
    const user = await client.users.getUser(userId)

    logger.debug('User status retrieved successfully', { userId, banned: user.banned, locked: user.locked })

    return {
      success: true,
      data: {
        banned: user.banned,
        locked: user.locked
      },
      message: 'User status retrieved successfully',
      pagination: {
        page: APP_CONSTANTS.clerk.pagination.defaultPage,
        limit: APP_CONSTANTS.clerk.pagination.singleItemLimit,
        total: APP_CONSTANTS.clerk.pagination.singleItemTotal,
        totalPages: APP_CONSTANTS.clerk.pagination.singleItemTotalPages,
        hasNext: false,
        hasPrev: false
      }
    }
  } catch (error) {
    logger.error('Failed to get user status', { userId, error })

    return {
      success: false,
      error: 'Failed to get user status',
      message: 'An error occurred while retrieving user status',
      pagination: {
        page: 1,
        limit: 1,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      }
    }
  }
}

/**
 * Ban user
 */
export async function banUser(userId: string): Promise<PaginatedApiResponse<null>> {
  try {
    logger.debug('Banning user', { userId })
    const client = await clerkClient()
    await client.users.banUser(userId)

    logger.debug('User banned successfully', { userId })

    return {
      success: true,
      data: null,
      message: 'User banned successfully',
      pagination: {
        page: 1, limit: 1, total: 1, totalPages: 1, hasNext: false, hasPrev: false
      }
    }
  } catch (error) {
    logger.error('Failed to ban user', { userId, error })

    return {
      success: false,
      error: 'Failed to ban user',
      message: 'An error occurred while banning the user',
      pagination: APP_CONSTANTS.clerk.pagination.empty
    }
  }
}

/**
 * Unban user
 */
export async function unbanUser(userId: string): Promise<PaginatedApiResponse<null>> {
  try {
    logger.debug('Unbanning user', { userId })
    const client = await clerkClient()
    await client.users.unbanUser(userId)

    logger.debug('User unbanned successfully', { userId })

    return {
      success: true,
      data: null,
      message: 'User unbanned successfully',
      pagination: {
        page: 1, limit: 1, total: 1, totalPages: 1, hasNext: false, hasPrev: false
      }
    }
  } catch (error) {
    logger.error('Failed to unban user', { userId, error })

    return {
      success: false,
      error: 'Failed to unban user',
      message: 'An error occurred while unbanning the user',
      pagination: APP_CONSTANTS.clerk.pagination.empty
    }
  }
}

/**
 * Lock user
 */
export async function lockUser(userId: string): Promise<PaginatedApiResponse<null>> {
  try {
    logger.debug('Locking user', { userId })
    const client = await clerkClient()
    await client.users.lockUser(userId)

    logger.debug('User locked successfully', { userId })

    return {
      success: true,
      data: null,
      message: 'User locked successfully',
      pagination: {
        page: 1, limit: 1, total: 1, totalPages: 1, hasNext: false, hasPrev: false
      }
    }
  } catch (error) {
    logger.error('Failed to lock user', { userId, error })

    return {
      success: false,
      error: 'Failed to lock user',
      message: 'An error occurred while locking the user',
      pagination: APP_CONSTANTS.clerk.pagination.empty
    }
  }
}

/**
 * Unlock user
 */
export async function unlockUser(userId: string): Promise<PaginatedApiResponse<null>> {
  try {
    logger.debug('Unlocking user', { userId })
    const client = await clerkClient()
    await client.users.unlockUser(userId)

    logger.debug('User unlocked successfully', { userId })

    return {
      success: true,
      data: null,
      message: 'User unlocked successfully',
      pagination: {
        page: 1, limit: 1, total: 1, totalPages: 1, hasNext: false, hasPrev: false
      }
    }
  } catch (error) {
    logger.error('Failed to unlock user', { userId, error })

    return {
      success: false,
      error: 'Failed to unlock user',
      message: 'An error occurred while unlocking the user',
      pagination: APP_CONSTANTS.clerk.pagination.empty
    }
  }
}

/**
 * Delete Clerk user only (does not delete from database)
 * Used for re-authentication scenarios where we need to remove the previous Clerk account
 */
export async function deleteClerkUser(userId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    logger.debug('Deleting Clerk user', { userId })

    const client = await clerkClient()
    await client.users.deleteUser(userId)

    logger.debug('Clerk user deleted successfully', { userId })

    return {
      success: true,
      message: 'Clerk user deleted successfully'
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    // Handle case where user doesn't exist (might already be deleted)
    // Clerk SDK may throw errors with messages containing "not found" or status codes
    const isNotFound = APP_CONSTANTS.clerk.errors.notFoundPatterns.some(pattern => 
      errorMessage.toLowerCase().includes(pattern)
    ) || (error && typeof error === 'object' && 'status' in error && error.status === APP_CONSTANTS.clerk.errors.notFoundStatusCode)
    
    if (isNotFound) {
      logger.debug('Clerk user not found (may already be deleted)', { userId, errorMessage })
      return {
        success: true,
        message: 'Clerk user not found (may already be deleted)'
      }
    }

    logger.error('Failed to delete Clerk user', { userId, error })
    return {
      success: false,
      error: errorMessage,
      message: 'Failed to delete Clerk user'
    }
  }
}

/**
 * Delete user (both from Clerk and database)
 */
export async function deleteUser(userId: string, dbUserId: string): Promise<PaginatedApiResponse<null>> {
  try {
    logger.debug('Deleting user', { userId, dbUserId })

    // First delete from Clerk
    const client = await clerkClient()
    await client.users.deleteUser(userId)

    logger.debug('User deleted from Clerk successfully', { userId })

    // Then delete from database
    const dbResult = await deleteUserFromDB(dbUserId)
    
    if (!dbResult.success) {
      logger.error('Failed to delete user from database', { dbUserId, error: dbResult.error })
      return {
        success: false,
        error: 'Failed to delete user from database',
        message: 'User was deleted from Clerk but failed to delete from database',
        pagination: {
          page: 1, limit: 1, total: 0, totalPages: 0, hasNext: false, hasPrev: false
        }
      }
    }

    logger.debug('User deleted from database successfully', { dbUserId })

    return {
      success: true,
      data: null,
      message: 'User deleted successfully',
      pagination: {
        page: 1, limit: 1, total: 1, totalPages: 1, hasNext: false, hasPrev: false
      }
    }
  } catch (error) {
    logger.error('Failed to delete user', { userId, dbUserId, error })

    return {
      success: false,
      error: 'Failed to delete user',
      message: 'An error occurred while deleting the user',
      pagination: APP_CONSTANTS.clerk.pagination.empty
    }
  }
}
