import { prisma } from '@/lib/prisma'
import type { assets } from '@/app/generated/prisma'
import { createLogger } from '@/lib/logger'

/**
 * Overview: Assets model for Prisma (Supabase)
 * - CRUD helpers for `assets` table
 * - Get paginated assets by user id
 * - Lookups by message id
 * - Save WhatsApp media (image/document) to Supabase Storage and return public URL
 */


export const AssetsModel = {

    findByMessageId: async (messageId: string): Promise<assets[]> => {
        return prisma.assets.findMany({
            where: {
                messages_id: messageId
            }
        })
    },

    findById: async (id: string): Promise<assets | null> => {
        return prisma.assets.findUnique({
            where: {
                id: id
            }
        })
    },

    findManyWithUserId: async (userId: string, limit: number, sortBy?: string, sortOrder?: 'asc' | 'desc', offset: number = 0, includeCount: boolean = false) => {
        // remember assets are in messages in sessions in users
        const where = {
            messages: {
                sessions: {
                    user_id: userId
                }
            }
        }

        const orderBy: Record<string, 'asc' | 'desc'> = {}
        if (sortBy) {
            orderBy[sortBy] = sortOrder as 'asc' | 'desc' || 'desc'
        }

        if (includeCount) {
            const [assets, totalCount] = await Promise.all([
                prisma.assets.findMany({
                    where,
                    orderBy,
                    skip: offset,
                    take: limit,
                    include: {
                        messages: {
                            select: {
                                id: true,
                                session_id: true,
                                role: true,
                                position: true,
                                created_at: true
                            }
                        }
                    }
                }),
                prisma.assets.count({ where })
            ])
            return { assets: assets || [] as assets[], count: totalCount as number }
        }

        return await prisma.assets.findMany({
            where,
            orderBy,
            take: limit,
            skip: offset,
            include: {
                messages: {
                    select: {
                        id: true,
                        session_id: true,
                        role: true,
                        position: true,
                        created_at: true
                    }
                }
            }
        })
    },

    createAsset: async (assetData: Omit<assets, 'id' | 'created_at' | 'updated_at'>): Promise<assets> => {
        return prisma.assets.create({
            data: assetData
        })
    },

    updateAsset: async (id: string, assetData: Omit<assets, 'id' | 'created_at' | 'updated_at'>): Promise<assets> => {
        return prisma.assets.update({
            where: { id: id },
            data: assetData
        })
    },

    deleteAsset: async (id: string): Promise<assets> => {
        return prisma.assets.delete({
            where: { id: id }
        })
    }
}

const logger = createLogger('AssetsModel')

// Types for media coming from WhatsApp Graph API
export interface WhatsAppMediaDescriptor {
    id: string
    url: string
    mime_type?: string
    file_size?: number
}

/**
 * Save message content (image/document) to Supabase Storage and return the public URL
 * - Downloads the media from WhatsApp temporary URL
 * - Uploads the binary to Supabase Storage bucket `onboarding.files`
 * - Returns the public URL for later use (e.g., rendering or passing to AI)
 */
export async function saveMessageContentToStorage(messageContent: WhatsAppMediaDescriptor): Promise<string> {
    const bucketName = 'onboarding.files'
    const fileExtension = getFileExtension(messageContent.mime_type || '')
    const fileName = `${messageContent.id}-${Date.now()}${fileExtension}`

    logger.debug('Downloading file from WhatsApp', {
        messageId: messageContent.id,
        url: messageContent.url
    })

    const fileResponse = await fetch(messageContent.url, {
        headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
        }
    })

    if (!fileResponse.ok) {
        logger.error('Failed to download file from WhatsApp', {
            status: fileResponse.status,
            statusText: fileResponse.statusText
        })
        throw new Error('Failed to download file from WhatsApp')
    }

    const fileArrayBuffer = await fileResponse.arrayBuffer()
    const fileBuffer = Buffer.from(fileArrayBuffer)

    const supabaseBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qagvfrmsfvwnvrhytjtq.supabase.co'
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseKey) {
        throw new Error('Supabase key not configured')
    }

    const uploadUrl = `${supabaseBaseUrl}/storage/v1/object/${bucketName}/${fileName}`

    const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: fileBuffer,
        headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': messageContent.mime_type || 'application/octet-stream',
            'x-upsert': 'false'
        }
    })

    if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        logger.error('Failed to upload file to Supabase Storage', {
            status: uploadResponse.status,
            statusText: uploadResponse.statusText,
            error: errorText
        })
        throw new Error(`Failed to save message content to storage: ${uploadResponse.statusText}`)
    }

    const publicUrl = `${supabaseBaseUrl}/storage/v1/object/public/${bucketName}/${fileName}`

    logger.debug('Successfully uploaded file to Supabase Storage', {
        fileName,
        publicUrl
    })

    return publicUrl
}

function getFileExtension(mimeType: string): string {
    const extMap: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'application/pdf': '.pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'text/plain': '.txt',
        'application/vnd.ms-excel': '.xls',
        'application/msword': '.doc'
    }

    return extMap[mimeType] || '.bin'
}