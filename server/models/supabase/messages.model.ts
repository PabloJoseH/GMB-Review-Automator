import { prisma } from '@/lib/prisma'
import type { messages, assets } from '@/app/generated/prisma'
import { APP_CONSTANTS } from '@/lib/constants'

/**
 * Overview: Messages model for Prisma (Supabase)
 * - CRUD helpers for `messages` table
 *   - find many with session id with order by created at
 *   - find many with last session of user id with order by created at
 *   - find by id
 *   - find by WhatsApp message ID (for deduplication)
 * - Create/update/delete operations
 *   - Support for whatsapp_message_id field (unique index)
 * - Dialog utilities
 *   - fetch recent messages limited to user and agent roles
 */

export const MessagesModel = {
    /**
     * get paginated messages with session id with order by created at
     */
    findManyWithSessionId: async (sessionId: string, limit: number, sortBy: string, sortOrder: 'asc' | 'desc' = 'desc', offset: number = APP_CONSTANTS.database.query.defaultOffset, includeCount: boolean = false) => {
        if (includeCount) {
            const [messages, totalCount] = await Promise.all([
                prisma.messages.findMany({
                    where: { session_id: sessionId },
                    orderBy: { [sortBy]: sortOrder },
                    skip: offset,
                    take: limit,
                }),
                prisma.messages.count({ where: { session_id: sessionId } })
            ])
            return { messages: messages || [] as messages[], totalCount: totalCount as number }
        }
        return await prisma.messages.findMany({
            where: { session_id: sessionId },
            orderBy: { [sortBy]: sortOrder },
            skip: offset,
            take: limit
        })
    },
    /**
     * Fetch the most recent user/agent messages for a session.
     * Messages are returned in chronological order (oldest first).
     */
    findRecentDialogMessages: async (sessionId: string, limit: number = APP_CONSTANTS.database.query.recentMessagesLimit): Promise<messages[]> => {
        const recentMessages = await prisma.messages.findMany({
            where: {
                session_id: sessionId,
                role: {
                    in: ['user', 'agent']
                }
            },
            orderBy: { created_at: 'desc' },
            take: limit
        })
        return recentMessages.reverse()
    },
    /**
     * get paginated messages with last session of user id with order by created at
     */
    findManyWithLastSessionOfUserId: async (userId: string, limit: number, sortBy: string, sortOrder: 'asc' | 'desc' = 'desc', offset: number = 0, includeCount: boolean = false) => {
        if (includeCount) {
            const [session, totalCount] = await Promise.all([
                prisma.sessions.findFirst({
                    where: { user_id: userId },
                    orderBy: { created_at: 'desc' },
                    include: {
                        messages: {
                            orderBy: { [sortBy]: sortOrder },
                            skip: offset,
                            take: limit,
                        },
                    },
                }),
                prisma.messages.count({ where: { sessions: { user_id: userId } } })
            ])
            const messagesList = session?.messages ?? []
            return { messages: messagesList as messages[], totalCount: totalCount as number }
        }
        // return only the messages
        const lastSession = await prisma.sessions.findFirst({
            where: { user_id: userId },
            orderBy: { created_at: 'desc' },
            include: {
                messages: {
                    orderBy: { [sortBy]: sortOrder },
                    skip: offset,
                    take: limit,
                },
            },
        })
        return lastSession?.messages ?? []
    },
    /**
     * get message by id
     */
    findById: async (id: string) => {
        return await prisma.messages.findUnique({
            where: { id }
        })
    },
    /**
     * Find message by WhatsApp message ID
     * Used for deduplication when processing webhooks
     * Note: Uses findFirst since Prisma schema doesn't reflect the unique index yet
     */
    findByWhatsAppMessageId: async (whatsappMessageId: string) => {
        return await prisma.messages.findFirst({
            where: { 
                whatsapp_message_id: whatsappMessageId 
            }
        })
    },
    /**
     * create message
     * also option to create asset in the same function
     */
    createMessage: async (messageData: Omit<messages, 'id' | 'created_at' | 'updated_at' | 'position'>, assetData?: Omit<assets, 'id' | 'messages_id' | 'created_at' | 'updated_at' | 'context'>) => {
        // Check if assetData exists and has content
        const hasAssetData = assetData && Object.keys(assetData).length > 0
        
        if (hasAssetData) {
            return await prisma.messages.create({
                data: {
                    ...messageData,
                    assets: { 
                        create: assetData 
                    }
                }
            })
        }
        
        return await prisma.messages.create({
            data: messageData
        })
    },
    /**
     * Create multiple messages in batch with sequential positions
     * Messages are created in the order provided to maintain conversation flow
     * @param messagesData - Array of message data (without id, created_at, updated_at, position)
     * @param assetsData - Optional array of asset data, one per message (can be undefined/null for messages without assets)
     * @returns Array of created messages in the same order as input
     */
    createMessagesBatch: async (
        tokens: number,
        messagesData: Array<Omit<messages, 'id' | 'created_at' | 'updated_at' | 'position'>>,
        assetsData?: Array<Omit<assets, 'id' | 'messages_id' | 'created_at' | 'updated_at' | 'context'> | null | undefined>
    ) => {
        return await prisma.$transaction(async (tx) => {
            // Get the current max position for this session (messages must have same session_id)
            const sessionId = messagesData[0]?.session_id
            if (!sessionId) {
                throw new Error('All messages must have the same session_id')
            }
            // update the session with the tokens
            await prisma.sessions.update({
                where: { id: sessionId },
                data: { tokens: tokens }
            })
            // Create all messages with sequential positions
            const createdMessages: messages[] = []
            for (let i = 0; i < messagesData.length; i++) {
                const messageData = messagesData[i]
                const assetData = assetsData?.[i]

                // Verify all messages belong to the same session
                if (messageData.session_id !== sessionId) {
                    throw new Error('All messages in batch must have the same session_id')
                }

                const hasAssetData = assetData && Object.keys(assetData).length > 0

                if (hasAssetData) {
                    const created = await tx.messages.create({
                        data: {
                            ...messageData,
                            assets: {
                                create: assetData
                            }
                        }
                    })
                    createdMessages.push(created)
                } else {
                    const created = await tx.messages.create({
                        data: {
                            ...messageData,
                        }
                    })
                    createdMessages.push(created)
                }
            }

            return createdMessages
        })
    },
    /**
     * update message
     */
    updateMessage: async (id: string, messageData: Omit<messages, 'id' | 'created_at' | 'updated_at'>) => {
        return await prisma.messages.update({
            where: { id },
            data: messageData
        })
    },
    /**
     * delete message
     */
    deleteMessage: async (id: string) => {
        return await prisma.messages.delete({
            where: { id }
        })
    }
}