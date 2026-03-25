import { prisma } from '@/lib/prisma'
import type { sessions } from '@/app/generated/prisma'

/**
 * Overview: Sessions model for Prisma (Supabase)
 * - CRUD helpers for `sessions` table
 * - paginated queries
 *   - find by user id
 *   - find by session id
 *   - find by previous response id
 *   - find by message id
 *   - find by asset id
 *   - find by created at
 *   - find by updated at
 */

export const SessionsModel = {
    /**
     * Find session by user id
     */
    findSessionByUserId: async (userId: string): Promise<sessions | null> => {
        // ask for the latest session by user id
        return prisma.sessions.findFirst({
            where: { user_id: userId },
            orderBy: { created_at: 'desc' }
        })
    },

    /**
     * Find session by session id
     */
    findSessionById: async (id: string): Promise<sessions | null> => {
        return prisma.sessions.findUnique({
            where: { id }
        })
    },

    /**
     * Find many sessions with relations
     * use includeCount to return the total count of sessions
     */
    findManyWithRelations: async (
        where: Record<string, unknown>,
        sortBy: string = 'created_at',
        sortOrder: 'asc' | 'desc' = 'desc',
        skip: number = 0,
        take: number = 10,
        includeCount: boolean = false
    ) => {
        if (includeCount) {
            const [sessions, totalCount] = await Promise.all([
                prisma.sessions.findMany({
                    where,
                    include: {
                        users: true
                    },
                    orderBy: { [sortBy]: sortOrder },
                    skip,
                    take
                }),
                prisma.sessions.count({ where })
            ])
            return { sessions: sessions as sessions[], totalCount: totalCount as number }
        }
        return prisma.sessions.findMany({
            where,
            include: {
                users: true
            },
            orderBy: { [sortBy]: sortOrder },
            skip,
            take
        })
    },

    createSession: async (sessionData: Omit<sessions, 'id' | 'created_at' | 'updated_at' | 'active' | 'summary'>) => {
        // add active true
        return prisma.sessions.create({
            data: {
                ...sessionData,
                active: true
            }
        })
    },

    updateSession: async (id: string, sessionData: Partial<Omit<sessions, 'id' | 'created_at' | 'updated_at' | 'active'>>) => {
        return prisma.sessions.update({
            where: { id },
            data: sessionData
        })
    },

    deleteSession: async (id: string) => {
        return prisma.sessions.delete({
            where: { id }
        })
    },

    buildWhereClause: (params: {
        user_id?: string
        previous_response_id?: string
        message_id?: string
        asset_id?: string
        created_at?: string
        updated_at?: string
    }) => {
        const { user_id, previous_response_id, message_id, asset_id, created_at, updated_at } = params
        const where: Record<string, unknown> = {}

        where.OR = [
            { user_id: user_id },
            { previous_response_id: previous_response_id },
            { message_id: message_id },
            { asset_id: asset_id },
            { created_at: created_at },
            { updated_at: updated_at }
        ]

        if (user_id) {
            where.user_id = user_id
        }
        if (previous_response_id) {
            where.previous_response_id = previous_response_id
        }
        if (message_id) {
            where.message_id = message_id
        }
        if (asset_id) {
            where.asset_id = asset_id
        }
        if (created_at) {
            where.created_at = created_at
        }
        if (updated_at) {
            where.updated_at = updated_at
        }

        return where
    },

    /**
     * Find all sessions with user data, message count, and last message
     * Returns all sessions (not just latest per user)
     * Includes the last message's created_at for sorting purposes
     */
    findAllWithLastMessage: async () => {
        return prisma.sessions.findMany({
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
                    orderBy: { created_at: 'desc' as const },
                    take: 1,
                    select: {
                        created_at: true
                    }
                }
            }
        })
    },

    /**
     * Find paginated sessions with user data, message count, tokens, and last message
     * Used for dashboard conversations table
     * Handles sorting and pagination in database
     */
    findManyWithUserAndLastMessage: async (
        sortBy: string = 'updated_at',
        sortOrder: 'asc' | 'desc' = 'desc',
        offset: number = 0,
        limit: number = 20
    ): Promise<{
        sessions: Array<{
            id: string
            user_id: string
            conversation_id: string | null
            agent_managed: boolean
            active: boolean
            created_at: Date | null
            updated_at: Date | null
            tokens: number
            _count: {
                messages: number
            }
            users: {
                id: string
                name: string | null
                lastname: string | null
                username: string
                email: string | null
                wa_id: string
            }
            messages: Array<{
                created_at: Date | null
            }>
        }>
        totalCount: number
    }> => {
        // For sorting by lastMessage, use updated_at as proxy since Prisma doesn't support
        // ordering by nested relation fields directly
        const orderByField = sortBy === 'lastMessage' ? 'updated_at' : sortBy

        const query = {
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
                    orderBy: { created_at: 'desc' as const },
                    take: 1,
                    select: {
                        created_at: true
                    }
                }
            },
            orderBy: { [orderByField]: sortOrder },
            skip: offset,
            take: limit
        }

        const [sessions, totalCount] = await Promise.all([
            prisma.sessions.findMany(query),
            prisma.sessions.count()
        ])
        return { sessions, totalCount }
    },

    /**
     * Count all sessions
     * Simple count query without relations
     */
    countAll: async () => {
        return prisma.sessions.count()
    }
}