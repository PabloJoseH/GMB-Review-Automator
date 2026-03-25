'use server'

/**
 * Sessions Server Actions
 *
 * Handles CRUD operations for WhatsApp conversation sessions.
 *
 * Key exports:
 * - `getPaginatedSessions`
 * - `getSessionById`
 * - `getSessionMessages`
 * - `getSessionMessagesPaginated`
 * - `getConversationsTableData`
 * - `setSessionAgentManaged`
 */

import { prisma } from '@/lib/prisma'
import { createLogger } from '@/lib/logger'
import { getAuthenticatedDatabaseUserId } from '@/lib/server-action-auth'
import { checkIfStaff } from '@/lib/auth-helpers'
import { GlobalConfigModel } from '@/server/models/supabase/global-config.model'
import { APP_CONSTANTS } from '@/lib/constants'
import type { message_role, sessions } from '../../../app/generated/prisma'
import type { PaginatedApiResponse } from '@/lib/api-types'
import type { SessionWithUserAndLastMessage } from '@/lib/prisma-types'

const logger = createLogger('SESSIONS')

export interface SessionsQueryParams {
  page: number
  limit: number
  userId?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface SessionWithMessageCount extends sessions {
  _count: {
    messages: number
  }
  messages?: Array<{
    created_at: Date | null
  }>
}

export type PaginatedSessionsResponse = PaginatedApiResponse<{
  sessions: SessionWithMessageCount[]
}>

/**
 * Get paginated sessions for a specific user
 * Includes message count for each session
 */
export async function getPaginatedSessions(params: SessionsQueryParams): Promise<PaginatedSessionsResponse> {
  try {
    const { clerkUserId, dbUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)

    if (!isStaff && params.userId && params.userId !== dbUserId) {
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
        message: 'Unauthorized session access',
        error: 'Forbidden session access'
      }
    }

    logger.debug('Getting paginated sessions', {
      page: params.page,
      limit: params.limit,
      userId: params.userId,
      clerkUserId
    })

    const offset = (params.page - 1) * params.limit
    const sortBy = params.sortBy || 'created_at'
    const sortOrder = params.sortOrder || 'desc'

    const where = isStaff
      ? (params.userId ? { user_id: params.userId } : {})
      : { user_id: dbUserId }

    //  Get sessions with messages count with promises.all
    const [sessions, totalCount] = await Promise.all([
      prisma.sessions.findMany({
        where,
        include: {
          _count: {
            select: {
              messages: true
            }
          },
          messages: {
            where: {
              created_at: { not: null }
            },
            orderBy: [
              { created_at: 'desc' }
            ],
            take: 1,
            select: {
              created_at: true
            }
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: offset,
        take: params.limit
      }),
      prisma.sessions.count({ where })
    ])

    const totalPages = Math.ceil(totalCount / params.limit)
    const hasNext = params.page < totalPages
    const hasPrev = params.page > 1

    logger.info('Sessions retrieved successfully', {
      totalSessions: totalCount,
      currentPage: params.page,
      totalPages
    })

    return {
      success: true,
      data: {
        sessions
      },
      pagination: {
        page: params.page,
        limit: params.limit,
        total: totalCount,
        totalPages,
        hasNext,
        hasPrev
      },
      message: 'Sessions retrieved successfully'
    }

  } catch (error) {
    // Extract error information for better logging
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorName = error instanceof Error ? error.name : typeof error
    
    logger.error('Failed to get paginated sessions', error, {
      userId: params.userId,
      page: params.page,
      limit: params.limit,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      errorType: errorName,
      errorDetails: errorMessage
    })
    
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
      message: 'Failed to retrieve sessions',
      error: errorMessage
    }
  }
}

/**
 * Get session by ID with messages
 */
export async function getSessionById(sessionId: string) {
  try {
    const { clerkUserId, dbUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)

    logger.debug('Getting session by ID', { sessionId, clerkUserId })

    const session = await prisma.sessions.findFirst({
      where: isStaff ? { id: sessionId } : { id: sessionId, user_id: dbUserId },
      include: {
        messages: {
          orderBy: {
            position: 'asc'
          }
        },
        users: {
          select: {
            id: true,
            name: true,
            lastname: true,
            username: true,
            email: true
          }
        }
      }
    })

    if (!session) {
      return {
        success: false,
        error: 'Session not found',
        message: 'No session found with this ID'
      }
    }

    logger.info('Session retrieved successfully', {
      sessionId: session.id,
      messageCount: session.messages.length
    })

    return {
      success: true,
      data: session,
      message: 'Session retrieved successfully'
    }

  } catch (error) {
    logger.error(`Failed to get session ${sessionId}`, error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve session'
    }
  }
}

export interface MessageWithSession {
  id: string
  session_id: string
  role: message_role
  content: string
  position: number | null
  created_at: Date | null
  updated_at: Date | null
}

export interface SessionMessagesResponse {
  success: boolean
  data?: {
    session: {
      id: string
      user_id: string
      conversation_id: string | null
      agent_managed: boolean
      active: boolean
      created_at: Date | null
      updated_at: Date | null
    }
    messages: MessageWithSession[]
  }
  error?: string
  message?: string
}

/**
 * Get all messages for a specific session
 * Returns messages ordered by position (conversation order)
 */
export async function getSessionMessages(sessionId: string): Promise<SessionMessagesResponse> {
  try {
    const { clerkUserId, dbUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)

    logger.debug('Getting session messages', { sessionId, clerkUserId })

    // Get session with messages ordered by position
    const session = await prisma.sessions.findFirst({
      where: isStaff ? { id: sessionId } : { id: sessionId, user_id: dbUserId },
      include: {
        messages: {
          orderBy: [
            { position: 'asc' },
            { created_at: 'asc' }
          ]
        }
      }
    })

    if (!session) {
      return {
        success: false,
        error: 'Session not found',
        message: 'The requested session does not exist'
      }
    }

    return {
      success: true,
      data: {
        session: {
          id: session.id,
          user_id: session.user_id,
          conversation_id: session.conversation_id,
          agent_managed: session.agent_managed,
          active: session.active,
          created_at: session.created_at,
          updated_at: session.updated_at
        },
        messages: session.messages.map(message => ({
          id: message.id,
          session_id: message.session_id,
          role: message.role,
          content: message.content,
          position: message.position,
          created_at: message.created_at,
          updated_at: message.updated_at
        }))
      }
    }
  } catch (error) {
    logger.error('Error getting session messages', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve session messages'
    }
  }
}

export interface PaginatedMessagesResponse {
  success: boolean
  data?: {
    session: {
      id: string
      user_id: string
      conversation_id: string | null
      agent_managed: boolean
      active: boolean
      created_at: Date | null
      updated_at: Date | null
      wa_id: string | null
    }
    messages: MessageWithSession[]
    pagination: {
      page: number
      limit: number
      total: number
      hasMore: boolean
    }
  }
  error?: string
  message?: string
}

/**
 * Get paginated messages for a specific session
 * Returns messages ordered by position (conversation order) with pagination
 * Designed for WhatsApp-style loading (newest first, load older messages)
 */
export async function getSessionMessagesPaginated(
  sessionId: string, 
  page: number = 1, 
  limit: number = 20
): Promise<PaginatedMessagesResponse> {
  try {
    const { clerkUserId, dbUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)

    logger.debug('Getting paginated session messages', { sessionId, page, limit, clerkUserId })

    // Get session info with user's wa_id
    const session = await prisma.sessions.findFirst({
      where: isStaff ? { id: sessionId } : { id: sessionId, user_id: dbUserId },
      select: {
        id: true,
        user_id: true,
        conversation_id: true,
        agent_managed: true,
        active: true,
        created_at: true,
        updated_at: true,
        users: {
          select: {
            wa_id: true
          }
        }
      }
    })

    if (!session) {
      return {
        success: false,
        error: 'Session not found',
        message: 'The requested session does not exist'
      }
    }

    // Get total message count
    const totalMessages = await prisma.messages.count({
      where: { session_id: sessionId }
    })

    // Calculate offset for pagination (newest first)
    const offset = (page - 1) * limit

    // Get messages ordered by position DESC (newest first) then by created_at DESC
    const messages = await prisma.messages.findMany({
      where: { session_id: sessionId },
      orderBy: [
        { position: 'desc' },
        { created_at: 'desc' }
      ],
      skip: offset,
      take: limit
    })

    // Reverse the messages to show oldest first in the UI (WhatsApp style)
    const orderedMessages = messages.reverse()

    return {
      success: true,
      data: {
        session: {
          id: session.id,
          user_id: session.user_id,
          conversation_id: session.conversation_id,
          agent_managed: session.agent_managed,
          active: session.active,
          created_at: session.created_at,
          updated_at: session.updated_at,
          wa_id: session.users?.wa_id || null
        },
        messages: orderedMessages.map(message => ({
          id: message.id,
          session_id: message.session_id,
          role: message.role,
          content: message.content,
          position: message.position,
          created_at: message.created_at,
          updated_at: message.updated_at
        })),
        pagination: {
          page,
          limit,
          total: totalMessages,
          hasMore: offset + limit < totalMessages
        }
      }
    }
  } catch (error) {
    logger.error('Error getting paginated session messages', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve session messages'
    }
  }
}

export interface ConversationsQueryParams {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface ConversationsTableData {
  sessions: SessionWithUserAndLastMessage[]
  thresholdTokens: number
}

export type ConversationsTableResponse = PaginatedApiResponse<ConversationsTableData>

/**
 * Get conversations table data for dashboard
 * Includes sessions with user data, message count, tokens, and threshold_tokens
 * Handles sorting and pagination in database
 */
export async function getConversationsTableData(params: ConversationsQueryParams): Promise<ConversationsTableResponse> {
  try {
    const { clerkUserId, dbUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)

    const page = Math.max(1, params.page || 1)
    const limit = params.limit || 20
    const sortBy = params.sortBy || 'updated_at'
    const sortOrder = params.sortOrder || 'desc'
    const offset = (page - 1) * limit

    logger.debug('Getting conversations table data', {
      page,
      limit,
      sortBy,
      sortOrder,
      clerkUserId
    })

    // Fetch threshold_tokens from global config
    const globalConfig = await GlobalConfigModel.findActive()
    const thresholdTokens = globalConfig?.threshold_tokens ?? APP_CONSTANTS.dashboard.tokens.defaultThreshold

    const orderByField = sortBy === 'lastMessage' ? 'updated_at' : sortBy

    const [sessions, totalCount] = await Promise.all([
      prisma.sessions.findMany({
        where: isStaff ? {} : { user_id: dbUserId },
        select: {
          id: true,
          user_id: true,
          conversation_id: true,
          agent_managed: true,
          active: true,
          created_at: true,
          updated_at: true,
          tokens: true,
          _count: {
            select: {
              messages: true
            }
          },
          users: {
            select: {
              id: true,
              name: true,
              lastname: true,
              username: true,
              email: true,
              wa_id: true
            }
          },
          messages: {
            orderBy: { created_at: 'desc' },
            take: 1,
            select: {
              created_at: true
            }
          }
        },
        orderBy: { [orderByField]: sortOrder },
        skip: offset,
        take: limit
      }),
      prisma.sessions.count({ where: isStaff ? {} : { user_id: dbUserId } })
    ])

    // If sorting by lastMessage, sort in memory using the last message's created_at
    let sortedSessions = sessions
    if (sortBy === 'lastMessage') {
      sortedSessions = [...sessions].sort((a, b) => {
        const aValue = a.messages?.[0]?.created_at || a.updated_at
        const bValue = b.messages?.[0]?.created_at || b.updated_at
        
        if (!aValue) return 1
        if (!bValue) return -1
        
        const aTime = aValue instanceof Date ? aValue.getTime() : new Date(aValue).getTime()
        const bTime = bValue instanceof Date ? bValue.getTime() : new Date(bValue).getTime()
        
        return sortOrder === 'asc' ? aTime - bTime : bTime - aTime
      })
    }

    const totalPages = Math.ceil(totalCount / limit)

    logger.info('Conversations table data retrieved successfully', {
      totalSessions: totalCount,
      currentPage: page,
      totalPages,
      thresholdTokens
    })

    return {
      success: true,
      data: {
        sessions: sortedSessions as SessionWithUserAndLastMessage[],
        thresholdTokens
      },
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      message: 'Conversations table data retrieved successfully'
    }

  } catch (error) {
    logger.error('Failed to get conversations table data', error)
    
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
      message: 'Failed to retrieve conversations table data',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Update session agent_managed flag
 */
export async function setSessionAgentManaged(sessionId: string, agentManaged: boolean) {
  try {
    const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
    const isStaff = await checkIfStaff(clerkUserId)

    const updateResult = await prisma.sessions.updateMany({
      where: isStaff ? { id: sessionId } : { id: sessionId, user_id: dbUserId },
      data: { agent_managed: agentManaged, updated_at: new Date() }
    })

    if (updateResult.count === 0) {
      return {
        success: false,
        error: 'Session not found',
      }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}
