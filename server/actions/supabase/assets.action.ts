/**
 * @fileoverview Assets server actions for Supabase.
 *
 * @remarks
 * Provides CRUD helpers for assets with ownership checks based on message sessions.
 *
 * Key exports:
 * - `getAssetsByMessageId`
 * - `getAssetById`
 * - `getPaginatedAssetsWithUserId`
 * - `createAsset`
 * - `updateAsset`
 * - `deleteAsset`
 *
 * Relevant types:
 * - `PaginatedAssetsResponse`
 * - `PaginatedAssetsQueryParams`
 */
'use server'

import { AssetsModel } from '@/server/models/supabase/assets.model'
import type { assets } from '@/app/generated/prisma'
import { createLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedDatabaseUserId } from '@/lib/server-action-auth'
import { checkIfStaff } from '@/lib/auth-helpers'

const logger = createLogger('ASSETS')

async function hasMessageOwnerAccess(messageId: string, userId: string): Promise<boolean> {
    const message = await prisma.messages.findFirst({
        where: {
            id: messageId,
            sessions: {
                user_id: userId
            }
        },
        select: { id: true }
    })

    return !!message
}

async function hasAssetOwnerAccess(assetId: string, userId: string): Promise<boolean> {
    const asset = await prisma.assets.findFirst({
        where: {
            id: assetId,
            messages: {
                sessions: {
                    user_id: userId
                }
            }
        },
        select: { id: true }
    })

    return !!asset
}

/**
 * Overview: Assets Server Actions for Supabase
 * - Handles asset CRUD operations directly through model layer
 */

export interface PaginatedAssetsResponse {
    assets: assets[]
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

export interface PaginatedAssetsQueryParams {
    page: number
    limit: number
    userId: string
}

export async function getAssetsByMessageId(messageId: string) {
    try {
        const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
        const isStaff = await checkIfStaff(clerkUserId)
        const allowed = isStaff || await hasMessageOwnerAccess(messageId, dbUserId)
        if (!allowed) {
            return {
                assets: [],
                message: 'Unauthorized asset access',
                success: false
            }
        }

        logger.debug(`Getting assets by message ID: ${messageId}`)
        const assets = await AssetsModel.findByMessageId(messageId)
        if (assets.length === 0) {
            logger.debug(`No assets found for message ID: ${messageId}`)
            return {
                assets: [],
                message: 'No assets found',
                success: true
            }
        }
        return {
            assets: assets,
            message: 'Assets found',
            success: true
        }
    } catch (error) {
        logger.error(`Error getting assets by message ID: ${messageId}`, { error })
        return {
            assets: [],
            message: 'Error getting assets',
            success: false
        }
    }
}

export async function getAssetById(id: string) {
    try {
        const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
        const isStaff = await checkIfStaff(clerkUserId)
        const allowed = isStaff || await hasAssetOwnerAccess(id, dbUserId)
        if (!allowed) {
            return {
                asset: null,
                message: 'Unauthorized asset access',
                success: false
            }
        }

        logger.debug(`Getting asset by ID: ${id}`)
        const asset = await AssetsModel.findById(id)
        if (!asset) {
            logger.debug(`No asset found for ID: ${id}`)
            return {
                asset: null,
                message: 'No asset found',
                success: true
            }
        }
        return {
            asset: asset,
            message: 'Asset found',
            success: true
        }
    } catch (error) {
        logger.error(`Error getting asset by ID: ${id}`, { error })
        return {
            asset: null,
            message: 'Error getting asset',
            success: false
        }
    }
}

export async function getPaginatedAssetsWithUserId(params: PaginatedAssetsQueryParams): Promise<PaginatedAssetsResponse> {
    try {
        const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
        const isStaff = await checkIfStaff(clerkUserId)
        if (!isStaff && params.userId !== dbUserId) {
            return {
                assets: [],
                pagination: {
                    page: 0,
                    limit: 0,
                    total: 0,
                    totalPages: 0,
                    hasNext: false,
                    hasPrev: false
                },
                message: 'Unauthorized asset access',
                success: false
            }
        }

        logger.debug(`Getting paginated assets with user ID: ${params.userId}`)
        const offset = (params.page - 1) * params.limit
        const { assets, count } = await AssetsModel.findManyWithUserId(params.userId, params.limit, 'created_at', 'desc', offset, true) as { assets: assets[], count: number }
        if (count === 0) {
            logger.debug(`No assets found for user ID: ${params.userId}`)
            return {
                assets: [],
                pagination: {
                    page: params.page,
                    limit: params.limit,
                    total: count,
                    totalPages: Math.ceil(count / params.limit),
                    hasNext: false,
                    hasPrev: false
                },
                message: 'No assets found',
                success: true
            }
        }
        return {
            assets: assets,
            pagination: {
                page: params.page,
                limit: params.limit,
                total: count,
                totalPages: Math.ceil(count / params.limit),
                hasNext: count > params.limit,
                hasPrev: params.page > 1
            },
            message: 'Assets found',
            success: true
        }
    } catch (error) {
        logger.error(`Error getting paginated assets with user ID: ${params.userId}`, { error })
        return {
            assets: [],
            pagination: {
                page: params.page,
                limit: params.limit,
                total: 0,
                totalPages: 0,
                hasNext: false,
                hasPrev: false
            },
            message: 'Error getting paginated assets',
            success: false
        }
    }
}

export async function createAsset(assetData: Omit<assets, 'id' | 'created_at' | 'updated_at'>) {
    try {
        const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
        const isStaff = await checkIfStaff(clerkUserId)
        const allowed = isStaff || await hasMessageOwnerAccess(assetData.messages_id, dbUserId)
        if (!allowed) {
            return {
                asset: null,
                message: 'Unauthorized asset access',
                success: false
            }
        }

        logger.debug(`Creating asset: ${assetData}`)
        const asset = await AssetsModel.createAsset(assetData)
        return {
            asset: asset,
            message: 'Asset created',
            success: true
        }
    } catch (error) {
        logger.error(`Error creating asset: ${assetData}`, { error })
        return {
            asset: null,
            message: 'Error creating asset',
            success: false
        }
    }
}

export async function updateAsset(id: string, assetData: Omit<assets, 'id' | 'created_at' | 'updated_at'>) {
    try {
        const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
        const isStaff = await checkIfStaff(clerkUserId)
        const allowed = isStaff || await hasAssetOwnerAccess(id, dbUserId)
        if (!allowed) {
            return {
                asset: null,
                message: 'Unauthorized asset access',
                success: false
            }
        }

        const allowedMessage = isStaff || await hasMessageOwnerAccess(assetData.messages_id, dbUserId)
        if (!allowedMessage) {
            return {
                asset: null,
                message: 'Unauthorized asset access',
                success: false
            }
        }

        logger.debug(`Updating asset: ${id} with data: ${assetData}`)
        const asset = await AssetsModel.updateAsset(id, assetData)
        if (!asset) {
            logger.debug(`No asset found for ID: ${id}`)
            return {
                asset: null,
                message: 'No asset found',
                success: true
            }
        }
        return {
            asset: asset,
            message: 'Asset updated',
            success: true
        }
    } catch (error) {
        logger.error(`Error updating asset: ${id} with data: ${assetData}`, { error })
        return {
            asset: null,
            message: 'Error updating asset',
            success: false
        }
    }
}

export async function deleteAsset(id: string) {
    try {
        const { dbUserId, clerkUserId } = await getAuthenticatedDatabaseUserId()
        const isStaff = await checkIfStaff(clerkUserId)
        const allowed = isStaff || await hasAssetOwnerAccess(id, dbUserId)
        if (!allowed) {
            return {
                asset: null,
                message: 'Unauthorized asset access',
                success: false
            }
        }

        logger.debug(`Deleting asset: ${id}`)
        const asset = await AssetsModel.deleteAsset(id)
        if (!asset) {
            logger.debug(`No asset found for ID: ${id}`)
            return {
                asset: null,
                message: 'No asset found',
                success: true
            }
        }
        return {
            asset: asset,
            message: 'Asset deleted',
            success: true
        }
    } catch (error) {
        logger.error(`Error deleting asset: ${id}`, { error })
        return {
            asset: null,
            message: 'Error deleting asset',
            success: false
        }
    }
}