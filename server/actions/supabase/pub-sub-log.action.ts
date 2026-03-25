/**
 * Overview: PubSubLog server actions
 * - Server-side actions for pub_sub_log data operations
 * - Defensive programming with input validation and error handling
 * - Returns standardized response format with success/error status
 */
'use server'

import { PubSubLogModel } from '@/server/models/supabase/pub-sub-log.model'
import { createLogger } from '@/lib/logger'
import { APP_CONSTANTS } from '@/lib/constants'
import { requireServerActionUser } from '@/lib/server-action-auth'
import { checkIfStaff } from '@/lib/auth-helpers'

const logger = createLogger('PUB_SUB_LOG')

/**
 * Ensures the authenticated user has staff access.
 * @returns Standardized response with authorization status
 */
async function requireStaffAccess() {
  const { clerkUserId } = await requireServerActionUser()
  const isStaff = await checkIfStaff(clerkUserId)

  if (!isStaff) {
    return {
      success: false,
      error: 'Unauthorized access',
      data: null,
      pagination: null
    }
  }

  return { success: true }
}

/**
 * Get paginated pub_sub_log entries
 * @param page - Page number (must be positive integer)
 * @param limit - Items per page (must be positive integer, max 100)
 * @returns Standardized response with data and pagination info
 */
export async function getPaginatedPubSubLogs(page: number, limit: number) {
  try {
    const staffAccess = await requireStaffAccess()
    if (!staffAccess.success) {
      return staffAccess
    }

    // Input validation
    if (!Number.isInteger(page) || page < 1) {
      return { 
        success: false, 
        error: 'Invalid page number. Must be a positive integer.',
        data: null,
        pagination: null
      }
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > APP_CONSTANTS.database.query.maxLimit) {
      return { 
        success: false, 
        error: 'Invalid limit. Must be between 1 and 100.',
        data: null,
        pagination: null
      }
    }

    const { rows, total } = await PubSubLogModel.paginate(page, limit)
    
    return { 
      success: true, 
      data: rows, 
      pagination: { page, limit, total } 
    }
  } catch (error) {
    logger.error('Error in getPaginatedPubSubLogs:', error)
    return {
      success: false,
      error: 'Failed to fetch paginated pub_sub_log entries',
      data: null,
      pagination: null
    }
  }
}

/**
 * Get summary of latest pub_sub_log entries
 * @returns Standardized response with summary data
 */
export async function getPubSubSummary() {
  try {
    const staffAccess = await requireStaffAccess()
    if (!staffAccess.success) {
      return { success: false, error: staffAccess.error, data: null }
    }

    const data = await PubSubLogModel.latestSummary()
    return { success: true, data, error: null }
  } catch (error) {
    logger.error('Error in getPubSubSummary:', error)
    return {
      success: false,
      error: 'Failed to fetch pub_sub_log summary',
      data: null
    }
  }
}

/**
 * Get dashboard statistics (users, organizations, locations, responses)
 * Uses defensive programming with error handling and safe defaults
 * @returns Standardized response with dashboard stats
 */
export async function getDashboardStats() {
  try {
    const staffAccess = await requireStaffAccess()
    if (!staffAccess.success) {
      return { success: false, error: staffAccess.error, data: null }
    }

    const stats = await PubSubLogModel.getDashboardStats()
    
    // Validate that stats are valid numbers
    const validatedStats = {
      totalUsers: Number.isInteger(stats.totalUsers) && stats.totalUsers >= 0 ? stats.totalUsers : 0,
      totalOrganizations: Number.isInteger(stats.totalOrganizations) && stats.totalOrganizations >= 0 ? stats.totalOrganizations : 0,
      totalLocations: Number.isInteger(stats.totalLocations) && stats.totalLocations >= 0 ? stats.totalLocations : 0,
      totalResponses: Number.isInteger(stats.totalResponses) && stats.totalResponses >= 0 ? stats.totalResponses : 0,
    }

    return {
      success: true,
      data: validatedStats,
      error: null
    }
  } catch (error) {
    logger.error('Error in getDashboardStats:', error)
    // Return safe defaults on error
    return {
      success: false,
      error: 'Failed to fetch dashboard statistics',
      data: {
        totalUsers: 0,
        totalOrganizations: 0,
        totalLocations: 0,
        totalResponses: 0
      }
    }
  }
}

/**
 * Get system statistics (process, reject, errors, asked, not_manage)
 * Uses defensive programming with error handling and safe defaults
 * Validates that all returned values are valid numbers
 * @returns Standardized response with system stats
 */
export async function getSystemStats() {
  try {
    const staffAccess = await requireStaffAccess()
    if (!staffAccess.success) {
      return { success: false, error: staffAccess.error, data: null }
    }

    const stats = await PubSubLogModel.getSystemStats()
    
    // Validate that all stats are valid numbers
    const validatedStats = {
      process: Number.isInteger(stats.process) && stats.process >= 0 ? stats.process : 0,
      reject: Number.isInteger(stats.reject) && stats.reject >= 0 ? stats.reject : 0,
      errors: Number.isInteger(stats.errors) && stats.errors >= 0 ? stats.errors : 0,
      asked: Number.isInteger(stats.asked) && stats.asked >= 0 ? stats.asked : 0,
      notManage: Number.isInteger(stats.notManage) && stats.notManage >= 0 ? stats.notManage : 0,
    }

    return {
      success: true,
      data: validatedStats,
      error: null
    }
  } catch (error) {
    logger.error('Error in getSystemStats:', error)
    // Return safe defaults on error
    return {
      success: false,
      error: 'Failed to fetch system statistics',
      data: {
        process: 0,
        reject: 0,
        errors: 0,
        asked: 0,
        notManage: 0
      }
    }
  }
}


