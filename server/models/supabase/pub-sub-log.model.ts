/**
 * Overview: PubSubLog model for Prisma (Supabase)
 * - Handles pagination and aggregation of pub_sub_log table data
 * - Provides dashboard statistics aggregation
 */
import { pub_sub_log } from '@/app/generated/prisma'
import { prisma } from '@/lib/prisma'
import { createLogger } from '@/lib/logger'
import { APP_CONSTANTS } from '@/lib/constants'

const logger = createLogger('PubSubLogModel')

export const PubSubLogModel = {
  /**
   * Paginate pub_sub_log entries with total count
   */
  paginate: async (page: number, limit: number) => {
    const skip = (page - 1) * limit
    // use Promise.all to get rows and total count
    const [rows, total] = await Promise.all([
      prisma.pub_sub_log.findMany({ orderBy: { time: 'desc' }, skip, take: limit }),
      prisma.pub_sub_log.count(),
    ])
    return { rows: rows as pub_sub_log[], total: total as number }
  },

  /**
   * Get summary of last pub_sub_log entries
   */
  latestSummary: async () => {
    // Get last rows summary for simple cards
    const rows = await prisma.pub_sub_log.findMany({ orderBy: { time: 'desc' }, take: APP_CONSTANTS.database.query.summaryLimit })
    return rows.reduce((acc, r) => {
      acc.process += r.process
      acc.reject += r.reject
      acc.errors += r.errors
      acc.asked += r.asked
      acc.notManage += r.not_manage
      return acc
    }, { process: 0, reject: 0, errors: 0, asked: 0, notManage: 0 })
  },

  /**
   * Get total count of processed responses from pub_sub_log
   * Uses aggregate to sum all process values safely
   */
  getTotalProcessedResponses: async (): Promise<number> => {
    try {
      const result = await prisma.pub_sub_log.aggregate({
        _sum: { process: true }
      })
      return result._sum?.process ?? 0
    } catch (error) {
      logger.error('Error getting total processed responses:', error)
      return 0
    }
  },

  /**
   * Get all dashboard statistics in a single transaction
   * Returns counts for users, organizations, locations, and processed responses
   */
  getDashboardStats: async () => {
    try {
      const [totalUsers, totalOrganizations, totalLocations, totalResponses] = await prisma.$transaction(async (tx) => {
        const [totalUsers, totalOrganizations, totalLocations, totalResponses] = await Promise.all([
          tx.users.count(),
          tx.organizations.count(),
          tx.locations.count(),
          tx.pub_sub_log.aggregate({ _sum: { process: true } }).then(result => result._sum?.process ?? 0),
        ])
        return [totalUsers, totalOrganizations, totalLocations, totalResponses]
      })

      return {
        totalUsers: totalUsers ?? 0,
        totalOrganizations: totalOrganizations ?? 0,
        totalLocations: totalLocations ?? 0,
        totalResponses: totalResponses ?? 0
      }
    } catch (error) {
      logger.error('Error getting dashboard stats:', error)
      // Return safe defaults on error
      return {
        totalUsers: 0,
        totalOrganizations: 0,
        totalLocations: 0,
        totalResponses: 0
      }
    }
  },

  /**
   * Get all system statistics (process, reject, errors, asked, not_manage)
   * Uses aggregate to sum all values in a single query
   * Returns an object with all count values
   */
  getSystemStats: async () => {
    try {
      const { _sum } = await prisma.pub_sub_log.aggregate({
        _sum: {
          process: true,
          reject: true,
          errors: true,
          asked: true,
          not_manage: true,
        },
      })

      return {
        process: _sum?.process ?? 0,
        reject: _sum?.reject ?? 0,
        errors: _sum?.errors ?? 0,
        asked: _sum?.asked ?? 0,
        notManage: _sum?.not_manage ?? 0
      }
    } catch (error) {
      logger.error('Error getting system stats:', error)
      // Return safe defaults on error
      return {
        process: 0,
        reject: 0,
        errors: 0,
        asked: 0,
        notManage: 0
      }
    }
  }
}


