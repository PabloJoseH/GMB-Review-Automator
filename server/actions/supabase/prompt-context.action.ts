'use server'

/**
 * @file Prompt context server actions.
 * @description Provides retrieval and update helpers for prompt context records tied to user locations.
 * @exports getPromptContextByLocation
 * @exports getPromptContextByLocationForUser
 * @exports updatePromptContext
 * @exports updatePromptContextMany
 */

import { PromptContextModel } from '../../models/supabase/prompt-context.model'
import { LocationsModel } from '../../models/supabase/locations.model'
import { createLogger } from '@/lib/logger'
import type { prompt_context } from '../../../app/generated/prisma'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedOrganizationAccess, requireServerActionUser } from '@/lib/server-action-auth'
import { checkIfStaff } from '@/lib/auth-helpers'

const logger = createLogger('PROMPT_CONTEXT')

async function getOrganizationAccessForAdmin() {
  const { clerkUserId } = await requireServerActionUser()
  const isStaff = await checkIfStaff(clerkUserId)

  if (isStaff) {
    return { isStaff }
  }

  const { organizationId } = await getAuthenticatedOrganizationAccess()
  return { isStaff, organizationId }
}

export interface PromptContextResponse {
  success: boolean
  data?: prompt_context
  error?: string
  message?: string
}

async function hasLocationAccess(locationId: string, organizationId: string): Promise<boolean> {
  const location = await prisma.locations.findFirst({
    where: {
      id: locationId,
      connections: {
        organization_id: organizationId
      }
    },
    select: { id: true }
  })

  return !!location
}

/**
 * Get prompt context by location ID
 */
export async function getPromptContextByLocation(locationId: string): Promise<PromptContextResponse> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const allowed = isStaff || await hasLocationAccess(locationId, organizationId)
    if (!allowed) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Getting prompt context by location ID', { locationId })

    const promptContext = await PromptContextModel.findByLocationId(locationId)

    logger.debug('Prompt context query result', { 
      locationId, 
      found: !!promptContext,
      tone: promptContext?.tone,
      responseLength: promptContext?.response_length 
    })

    if (!promptContext) {
      logger.debug('Prompt context not found for location', { locationId })
      return {
        success: false,
        error: 'Prompt context not found',
        message: 'No prompt context configuration found for this location'
      }
    }

    logger.debug('Prompt context retrieved successfully', { 
      locationId, 
      tone: promptContext.tone,
      responseLength: promptContext.response_length 
    })

    return {
      success: true,
      data: promptContext
    }
  } catch (error) {
    logger.error('Error getting prompt context by location ID', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve prompt context'
    }
  }
}

/**
 * Get prompt context by location ID with user ownership validation
 * Validates that the location belongs to the authenticated user before returning the prompt context
 */
export async function getPromptContextByLocationForUser(
  locationId: string,
  userId: string
): Promise<PromptContextResponse> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const allowed = isStaff || await hasLocationAccess(locationId, organizationId)
    if (!allowed) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Getting prompt context by location ID for user', { locationId, userId })

    const location = await LocationsModel.findById(locationId)
    
    if (!location) {
      logger.debug('Location not found', { locationId })
      return {
        success: false,
        error: 'Location not found',
        message: 'The specified location does not exist'
      }
    }

    const promptContext = await PromptContextModel.findByLocationId(locationId)

    if (!promptContext) {
      logger.debug('Prompt context not found for location', { locationId })
      return {
        success: false,
        error: 'Prompt context not found',
        message: 'No prompt context configuration found for this location'
      }
    }

    logger.debug('Prompt context retrieved successfully for user', { 
      locationId, 
      userId,
      tone: promptContext.tone,
      responseLength: promptContext.response_length 
    })

    return {
      success: true,
      data: promptContext
    }
  } catch (error) {
    logger.error('Error getting prompt context by location ID for user', error, { locationId, userId })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to retrieve prompt context'
    }
  }
}

/**
 * Update prompt context for a location
 */
export async function updatePromptContext(
  locationId: string, 
  data: Partial<Omit<prompt_context, 'id' | 'location_id' | 'created_at' | 'updated_at'>>
): Promise<PromptContextResponse> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const allowed = isStaff || await hasLocationAccess(locationId, organizationId)
    if (!allowed) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Updating prompt context', { locationId, data })

    const updatedPromptContext = await PromptContextModel.upsert(locationId, {
      tone: data.tone,
      response_length: data.response_length,
      cta: data.cta,
      use_emojis: data.use_emojis,
      language: data.language,
      on_5_star: data.on_5_star,
      on_4_star: data.on_4_star,
      on_3_star: data.on_3_star,
      on_2_star: data.on_2_star,
      on_1_star: data.on_1_star
    })

    logger.debug('Prompt context updated successfully', { 
      locationId, 
      tone: updatedPromptContext.tone,
      responseLength: updatedPromptContext.response_length 
    })

    return {
      success: true,
      data: updatedPromptContext
    }
  } catch (error) {
    logger.error('Error updating prompt context', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to update prompt context'
    }
  }
}

/**
 * Updates prompt context for multiple locations at once.
 * @param locationIds List of location IDs to update.
 * @param data Fields to apply to each prompt context.
 */
export async function updatePromptContextMany(
  locationIds: string[],
  data: Partial<Omit<prompt_context, 'id' | 'location_id' | 'created_at' | 'updated_at'>>
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff) {
      const allowedLocations = await prisma.locations.findMany({
        where: {
          id: { in: locationIds },
          connections: {
            organization_id: organizationId
          }
        },
        select: { id: true }
      })

      if (allowedLocations.length !== locationIds.length) {
        return {
          success: false,
          count: 0,
          error: 'Unauthorized organization access'
        }
      }
    }

    logger.debug('Updating prompt context for multiple locations', {
      locationCount: locationIds.length,
      hasTone: data.tone !== undefined,
      hasLanguage: data.language !== undefined
    })

    if (!locationIds.length) {
      return {
        success: false,
        count: 0,
        error: 'No location IDs provided'
      }
    }

    const sanitizedData: Record<string, unknown> = {}

    if (data.tone !== undefined) sanitizedData.tone = data.tone
    if (data.response_length !== undefined) sanitizedData.response_length = data.response_length
    if (data.cta !== undefined) sanitizedData.cta = data.cta
    if (data.use_emojis !== undefined) sanitizedData.use_emojis = data.use_emojis
    if (data.language !== undefined) sanitizedData.language = data.language
    if (data.on_5_star !== undefined) sanitizedData.on_5_star = data.on_5_star
    if (data.on_4_star !== undefined) sanitizedData.on_4_star = data.on_4_star
    if (data.on_3_star !== undefined) sanitizedData.on_3_star = data.on_3_star
    if (data.on_2_star !== undefined) sanitizedData.on_2_star = data.on_2_star
    if (data.on_1_star !== undefined) sanitizedData.on_1_star = data.on_1_star
    if (data.custom_instruction !== undefined) sanitizedData.custom_instruction = data.custom_instruction

    if (!Object.keys(sanitizedData).length) {
      return {
        success: false,
        count: 0,
        error: 'No fields provided to update'
      }
    }

    const result = await PromptContextModel.updateMany(locationIds, sanitizedData)

    logger.debug('Prompt context batch update finished', {
      requested: locationIds.length,
      updated: result.count
    })

    return {
      success: true,
      count: result.count
    }
  } catch (error) {
    logger.error('Error updating prompt context for multiple locations', error)
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}
