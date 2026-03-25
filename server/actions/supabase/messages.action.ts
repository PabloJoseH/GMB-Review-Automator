/**
 * @fileoverview Messages server actions for Supabase.
 *
 * @remarks
 * Provides read/write helpers for conversation messages with session ownership checks.
 *
 * Key exports:
 * - `getPaginatedMessagesWithSessionId`
 * - `getPaginatedMessagesWithLastSessionOfUserId`
 * - `getMessageById`
 * - `getMessageByWhatsAppMessageId`
 *
 * Relevant types:
 * - `MessagesQueryParams`
 * - `PaginatedMessagesResponse`
 */
'use server'

import { MessagesModel } from '@/server/models/supabase/messages.model'
import type { messages } from '@/app/generated/prisma'
import { createLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedDatabaseUserId } from '@/lib/server-action-auth'
import { checkIfStaff } from '@/lib/auth-helpers'

const logger = createLogger('MESSAGES')

async function hasSessionOwnerAccess(sessionId: string, userId: string): Promise<boolean> {
    const session = await prisma.sessions.findFirst({
        where: {
            id: sessionId,
            user_id: userId
        },
        select: { id: true }
    })

    return !!session
}

/**
 * Overview: Messages server actions for Supabase
 * - CRUD helpers for `messages` table
 *   - find many with session id with order by created at
 *   - find many with last session of user id with order by created at
 *   - find by id
 *   - find by WhatsApp message ID (for deduplication)
 */

export interface MessagesQueryParams {
    page: number
    limit: number
    id: string
}

export interface PaginatedMessagesResponse {
    messages: messages[]
    pagination: {
        page: number
        limit: number
        total: number
        totalPages: number
        hasNext: boolean
        hasPrev: boolean
    }
    message: string
    success: boolean
    error?: string
}

export async function getPaginatedMessagesWithSessionId(params: MessagesQueryParams) : Promise<PaginatedMessagesResponse> {
    try {
        const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
        const isStaff = await checkIfStaff(clerkUserId)
        const allowed = isStaff || await hasSessionOwnerAccess(params.id, dbUserId)
        if (!allowed) {
            return {
                messages: [],
                pagination: {
                    page: 0,
                    limit: 0,
                    total: 0,
                    totalPages: 0,
                    hasNext: false,
                    hasPrev: false
                },
                message: 'Unauthorized conversation access',
                success: false,
                error: 'Unauthorized'
            }
        }

        logger.debug('Getting paginated messages with session id', { id: params.id })
        const offset = (params.page - 1) * params.limit
        const { messages, totalCount } = await MessagesModel.findManyWithSessionId(params.id, params.limit, 'created_at', 'desc', offset, true) as { messages: messages[], totalCount: number }
        if (!messages) {
            return {
                messages: [],
                pagination: {
                    page: 0,
                    limit: 0,
                    total: 0,
                    totalPages: 0,
                    hasNext: false,
                    hasPrev: false
                },
                message: 'Messages not found',
                success: false,
                error: 'Messages not found'
            }
        }
        return {
            messages,
            pagination: {
                page: params.page,
                limit: params.limit,
                total: totalCount,
                totalPages: Math.ceil(totalCount / params.limit),
                hasNext: params.page < Math.ceil(totalCount / params.limit),
                hasPrev: params.page > 1
            },
            message: 'Messages retrieved successfully',
            success: true,
            error: undefined
        }
    } catch (error) {
        logger.error('Error getting paginated messages with session id', error)
        return {
            messages: [],
            pagination: {
                page: 0,
                limit: 0,
                total: 0,
                totalPages: 0,
                hasNext: false,
                hasPrev: false
            },
            message: 'Error getting paginated messages with session id',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
    }
}

export async function getPaginatedMessagesWithLastSessionOfUserId(params: MessagesQueryParams) : Promise<PaginatedMessagesResponse> {
    try {
        const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
        const isStaff = await checkIfStaff(clerkUserId)
        if (!isStaff && params.id !== dbUserId) {
            return {
                messages: [],
                pagination: {
                    page: 0,
                    limit: 0,
                    total: 0,
                    totalPages: 0,
                    hasNext: false,
                    hasPrev: false
                },
                message: 'Unauthorized conversation access',
                success: false,
                error: 'Unauthorized'
            }
        }

        logger.debug('Getting paginated messages with last session of user id', { id: params.id })
        const offset = (params.page - 1) * params.limit
        const { messages, totalCount } = await MessagesModel.findManyWithLastSessionOfUserId(params.id, params.limit, 'created_at', 'desc', offset, true) as { messages: messages[], totalCount: number }
        if (!messages) {
            return {
                messages: [],
                pagination: {
                    page: 0,
                    limit: 0,
                    total: 0,
                    totalPages: 0,
                    hasNext: false,
                    hasPrev: false
                },
                message: 'Messages not found',
                success: false,
                error: 'Messages not found'
            }
        }
        return {
            messages,
            pagination: {
                page: params.page,
                limit: params.limit,
                total: totalCount,
                totalPages: Math.ceil(totalCount / params.limit),
                hasNext: params.page < Math.ceil(totalCount / params.limit),
                hasPrev: params.page > 1
            },
            message: 'Messages retrieved successfully',
            success: true,
            error: undefined
        }
    } catch (error) {
        logger.error('Error getting paginated messages with last session of user id', error)
        return {
            messages: [],
            pagination: {
                page: 0,
                limit: 0,
                total: 0,
                totalPages: 0,
                hasNext: false,
                hasPrev: false
            },
            message: 'Error getting paginated messages with last session of user id',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
    }
}

export async function getMessageById(id: string) {
    try {
        const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
        const isStaff = await checkIfStaff(clerkUserId)

        logger.debug('Getting message by id', { id })
        const message = await MessagesModel.findById(id)
        if (!message) {
            return {
                success: false,
                error: 'Message not found',
                message: 'Message not found'
            }
        }

        const allowed = isStaff || await hasSessionOwnerAccess(message.session_id, dbUserId)
        if (!allowed) {
            return {
                success: false,
                error: 'Unauthorized',
                message: 'Unauthorized conversation access'
            }
        }

        return {
            message_data: message,
            success: true,
            error: undefined,
            message: 'Message retrieved successfully'
        }
    } catch (error) {
        logger.error('Error getting message by id', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Error getting message by id'
        }
    }
}

/**
 * Get message by WhatsApp message ID
 * Used for deduplication when processing WhatsApp webhooks
 */
export async function getMessageByWhatsAppMessageId(whatsappMessageId: string) {
    try {
        const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
        const isStaff = await checkIfStaff(clerkUserId)

        logger.debug('Getting message by WhatsApp message ID', { whatsappMessageId })
        const message = await MessagesModel.findByWhatsAppMessageId(whatsappMessageId)
        if (!message) {
            return {
                success: false,
                error: 'Message not found',
                message: 'Message not found'
            }
        }

        const allowed = isStaff || await hasSessionOwnerAccess(message.session_id, dbUserId)
        if (!allowed) {
            return {
                success: false,
                error: 'Unauthorized',
                message: 'Unauthorized conversation access'
            }
        }

        return {
            message_data: message,
            success: true,
            error: undefined,
            message: 'Message retrieved successfully'
        }
    } catch (error) {
        logger.error('Error getting message by WhatsApp message ID', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Error getting message by WhatsApp message ID'
        }
    }
}

/**
 * Check if a WhatsApp message ID already exists in the database
 * Used for deduplication when processing WhatsApp webhooks
 * @param whatsappMessageId - The WhatsApp message ID to check
 * @returns Promise with exists flag indicating if the message was already processed
 */
export async function checkWhatsAppMessageExists(whatsappMessageId: string): Promise<{ exists: boolean; error?: string }> {
    try {
        logger.debug('Checking if WhatsApp message exists', { whatsappMessageId })
        const message = await MessagesModel.findByWhatsAppMessageId(whatsappMessageId)
        return {
            exists: !!message
        }
    } catch (error) {
        logger.error('Error checking if WhatsApp message exists', error)
        return {
            exists: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
    }
}

export async function createMessage(message: messages) {
    try {
        logger.debug('Creating message', { message })
        const newMessage = await MessagesModel.createMessage(message)
        return {
            message_data: newMessage,
            success: true,
            error: undefined,
            message: 'Message created successfully'
        }
    } catch (error) {
        logger.error('Error creating message', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Error creating message'
        }
    }
}

export async function updateMessage(id: string, message: messages) {
    try {
        logger.debug('Updating message', { id, message })
        const updatedMessage = await MessagesModel.updateMessage(id, message)
        if (!updatedMessage) {
            return {
                success: false,
                error: 'Message not updated',
                message: 'Message not updated'
            }
        }
        return {
            message_data: updatedMessage,
            success: true,
            error: undefined,
            message: 'Message updated successfully'
        }
    } catch (error) {
        logger.error('Error updating message', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Error updating message'
        }
    }
}

/**
 * Create an employee message for a session
 */
export async function createEmployeeMessage(sessionId: string, content: string) {
    try {
        const newMessage = await MessagesModel.createMessage({
            session_id: sessionId,
            role: 'employee',
            content,
            whatsapp_message_id: null
        })
        return {
            success: true,
            message_data: newMessage
        }
    } catch (error) {
        logger.error('Error creating employee message', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
    }
}

export async function deleteMessage(id: string) {
    try {
        logger.debug('Deleting message', { id })
        const deletedMessage = await MessagesModel.deleteMessage(id)
        if (!deletedMessage) {
            return {
                success: false,
                error: 'Message not deleted',
                message: 'Message not deleted'
            }
        }
        return {
            message_data: deletedMessage,
            success: true,
            error: undefined,
            message: 'Message deleted successfully'
        }
    } catch (error) {
        logger.error('Error deleting message', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Error deleting message'
        }
    }
}