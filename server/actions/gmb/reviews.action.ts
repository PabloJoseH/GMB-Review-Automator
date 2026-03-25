/**
 * GMB Reviews Actions - Server Actions for Google My Business Reviews
 * 
 * This file contains server actions for handling Google My Business review operations.
 * Includes functions to retrieve, sync, and persist reviews with optimized batch handling.
 * 
 * Main features:
 * - Get Google My Business reviews by user and filters
 * - Sync reviews with local database using batch operations
 * - Persist reviews with change detection and deduplication
 * - Generate review summaries using OpenAI and save them in prompt_context
 * - Calculate review and response analytics
 * - End-to-end orchestration of the entire synchronization process
 * - Send developer WhatsApp messages only when user session has agent_managed = true
 */

'use server'

import { GmbReviewsModel, type GoogleMyBusinessReview } from '../../models/gmb/reviews.model'
import { createLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { safeCall, type GlobalRateLimitState } from '@/lib/api-helpers'
import { APP_CONSTANTS } from '@/lib/constants'
import { previewString } from '@/lib/utils'

const logger = createLogger('GMB-REVIEWS')

import { ReviewsModel, type ReviewToSave } from '../../models/supabase/reviews.model'
import { UsersModel } from '../../models/supabase/users.model'
import { LocationsModel } from '../../models/supabase/locations.model'
import type { locations, example_reviews } from '../../../app/generated/prisma'
import { getGoogleAccessToken } from '../clerk/users.action'
import { OpenAIConversations, summarizeMessages } from '@/server/models/openAI/conversation.model'
import { GlobalConfigModel } from '@/server/models/supabase/global-config.model'
import { PromptContextModel } from '@/server/models/supabase/prompt-context.model'
import { SessionsModel } from '@/server/models/supabase/sessions.model'
import { sendDeveloperMessage } from '../whatsapp/responder.action'

export interface ProcessReviewsResult {
  reviews: GoogleMyBusinessReview[]
  savedReviews: number
  updatedReviews: number
  totalReviews: number
  locations: Array<{ id: string; name: string | null; google_location_id: string | null }>
  summary: {
    totalReviews: number
    reviewsWithResponses: number
    averageRating: number
    recentReviews: Array<{
      author: string
      rating: number
      comment: string | null
      createTime: string
      hasResponse: boolean
    }>
  }
  apiInfo: {
    version: string
    endpoint: string
    method: string
    locationsProcessed: number
  }
  message: string
}

export interface SyncReviewsResult {
  savedCount: number
  updatedCount: number
  created: example_reviews[]
  updated: example_reviews[]
  error?: string
  message?: string
  analytics?: {
    locationsWithWebsite: number
    locationsWithPhone: number
    locationsWithHours: number
    locationsWithAddress: number
    locationsWithCoordinates: number
    completenessScore: number
  }
}

export interface ReviewFilters {
  accountIds?: string[]
  locationIds?: string[]
}

// Type definition for locations with embedded connections
type LocationWithConnections = locations & {
  connections?: {
    id: string
    external_account_id: string
  } | null
}

/**
 * Builds the WHERE clause to filter locations by user and optional filters.
 */
function buildLocationWhereClause(userId: string, filters: ReviewFilters) {
  const whereClause: {
    created_by: string
    status?: 'active' | 'inactive'
    connections?: { external_account_id: { in: string[] } }
    google_location_id?: { in: string[] }
  } = {
    created_by: userId,
    status: 'active'
  }

  // Filter by Account IDs when provided
  if (filters.accountIds?.length) {
    whereClause.connections = {
      external_account_id: { in: filters.accountIds }
    }
  }

  // Filter by Location IDs when provided
  if (filters.locationIds?.length) {
    whereClause.google_location_id = { in: filters.locationIds }
  }

  return whereClause
}

/**
 * Converts GMB reviews to the persistence format, enforcing database limits.
 */
function convertReviewsToSaveFormat(reviews: GoogleMyBusinessReview[], locationId: string): ReviewToSave[] {
  const reviewsToSave: ReviewToSave[] = []

  for (const review of reviews) {
    // Convert starRating to a numeric value
    const ratingMap = {
      'ONE': 1,
      'TWO': 2,
      'THREE': 3,
      'FOUR': 4,
      'FIVE': 5
    }
    
    const rating = ratingMap[review.starRating]
    
    if (!rating) {
      logger.debug('Rating inválido en reseña', { 
        starRating: review.starRating,
        reviewName: review.name 
      })
      continue
    }

    // Prepare payload including the owner response
    const rawAuthorName = review.reviewer.displayName || 'Usuario Anónimo'
    const rawComment = review.comment || ''
    const rawResponse = review.reviewReply?.comment || null
    
    // Log truncations for debugging
    const authorTruncated = rawAuthorName.length > APP_CONSTANTS.database.fieldLimits.authorName
    const commentTruncated = rawComment.length > APP_CONSTANTS.database.fieldLimits.comment
    const responseTruncated = rawResponse && rawResponse.length > APP_CONSTANTS.database.fieldLimits.response
    
    if (authorTruncated || commentTruncated || responseTruncated) {
      logger.debug('🔄 TRUNCANDO campos largos para BD', {
        locationId: locationId,
        reviewName: review.name,
        authorTruncated: authorTruncated ? `${rawAuthorName.length}→${APP_CONSTANTS.database.fieldLimits.authorName}` : false,
        commentTruncated: commentTruncated ? `${rawComment.length}→${APP_CONSTANTS.database.fieldLimits.comment}` : false,
        responseTruncated: responseTruncated ? `${rawResponse?.length}→${APP_CONSTANTS.database.fieldLimits.response}` : false
      })
    }
    
    const reviewData: ReviewToSave = {
      location_id: locationId,
      author_name: rawAuthorName.length > APP_CONSTANTS.database.fieldLimits.authorName ? rawAuthorName.substring(0, APP_CONSTANTS.database.fieldLimits.authorName) : rawAuthorName,
      rating: rating,
      comment: rawComment.length > APP_CONSTANTS.database.fieldLimits.comment ? rawComment.substring(0, APP_CONSTANTS.database.fieldLimits.comment) : rawComment,
      response: rawResponse && rawResponse.length > APP_CONSTANTS.database.fieldLimits.response ? rawResponse.substring(0, APP_CONSTANTS.database.fieldLimits.response) : rawResponse,
      review_time: new Date(review.createTime)
    }
    
    reviewsToSave.push(reviewData)
  }

  return reviewsToSave
}

/**
 * Sincroniza reseñas usando estrategia optimizada de batch create/update
 */
async function syncReviewsBatchAndPersist(params: {
  reviewsToSave: ReviewToSave[]
  createChunkSize?: number
  updateChunkSize?: number
}): Promise<SyncReviewsResult> {
  const { reviewsToSave, createChunkSize = APP_CONSTANTS.database.batch.createChunkSize, updateChunkSize = APP_CONSTANTS.database.batch.updateChunkSize } = params
  let savedCount = 0
  let updatedCount = 0
  const result = { created: [] as example_reviews[], updated: [] as example_reviews[] }

  if (!Array.isArray(reviewsToSave) || reviewsToSave.length === 0) {
    logger.debug('No hay reseñas para procesar')
    return { savedCount, updatedCount, ...result }
  }

  try {
    logger.debug('Iniciando guardado optimizado de reseñas', { totalReviews: reviewsToSave.length })

    // Normalize and deduplicate internally via composite keys
    const keyOf = (r: ReviewToSave) =>
      `${r.location_id}||${r.author_name}||${(r.review_time instanceof Date ? r.review_time.toISOString() : new Date(r.review_time ?? new Date()).toISOString())}`

    const seen = new Map<string, ReviewToSave>()
    for (const r of reviewsToSave) {
      if (!r || !r.location_id || !r.author_name || !r.review_time) continue
      const k = keyOf(r)
      if (!seen.has(k)) seen.set(k, r)
    }
    const uniqueReviews = Array.from(seen.values())

    // Prepare sets for a single lookup of existing rows
    const locationIds = Array.from(new Set(uniqueReviews.map(r => r.location_id)))
    const authorNames = Array.from(new Set(uniqueReviews.map(r => r.author_name ?? '')))
    const reviewTimes = Array.from(new Set(uniqueReviews.map(r => (r.review_time instanceof Date ? r.review_time.toISOString() : new Date(r.review_time ?? new Date()).toISOString())))).map(s => new Date(s))

    // Fetch existing entries using one query
    const existingReviews = await ReviewsModel.findExistingReviews(locationIds, authorNames, reviewTimes)

    // Map entries using the composite key
    const existingMap = new Map<string, example_reviews>()
    for (const er of existingReviews) {
      const reviewTimeStr = er.review_time 
        ? (er.review_time instanceof Date ? er.review_time.toISOString() : new Date(er.review_time).toISOString())
        : new Date().toISOString()
      const k = `${er.location_id}||${er.author_name}||${reviewTimeStr}`
      if (!existingMap.has(k)) existingMap.set(k, er)
    }

    // Classify work items
    const toCreate: Array<{
      location_id: string
      author_name: string
      rating: number | null
      comment: string
      response: string | null
      review_time: Date
    }> = []
    const toUpdate: Array<{ id: string; data: { response: string | null; rating: number | null; comment: string } }> = []

    for (const r of uniqueReviews) {
      const k = keyOf(r)
      const existing = existingMap.get(k)
      if (existing) {
        const responseChanged = (existing.response ?? null) !== (r.response ?? null)
        const ratingChanged = (existing.rating ?? null) !== (r.rating ?? null)
        const commentChanged = (existing.comment ?? null) !== (r.comment ?? null)

        if (responseChanged || ratingChanged || commentChanged) {
          toUpdate.push({
            id: existing.id,
            data: {
              response: r.response ?? null,
              rating: r.rating ?? null,
              comment: r.comment ?? ''
            }
          })
        }
      } else {
        toCreate.push({
          location_id: r.location_id,
          author_name: r.author_name ?? '',
          rating: r.rating ?? null,
          comment: r.comment ?? '',
          response: r.response ?? null,
          review_time: r.review_time ?? new Date()
        })
      }
    }

    logger.debug('Plan de operaciones', { toCreate: toCreate.length, toUpdate: toUpdate.length })

    // Run createMany in chunks with skipDuplicates: true
    if (toCreate.length > 0) {
      for (let i = 0; i < toCreate.length; i += createChunkSize) {
        const chunk = toCreate.slice(i, i + createChunkSize)
        const createRes = await ReviewsModel.createManyReviews(chunk)
        const createdInChunk = typeof createRes?.count === 'number' ? createRes.count : chunk.length
        savedCount += createdInChunk
        logger.debug('createMany chunk ejecutado', { chunkSize: chunk.length, createdInChunk })
      }
    }

    // Run updates in batched transactions
    if (toUpdate.length > 0) {
      for (let i = 0; i < toUpdate.length; i += updateChunkSize) {
        const chunk = toUpdate.slice(i, i + updateChunkSize)
        const updatedRows = await ReviewsModel.executeTransaction(async (tx) => {
          return Promise.all(chunk.map(item =>
            tx.example_reviews.update({
              where: { id: item.id },
              data: {
                response: item.data.response,
                rating: item.data.rating,
                comment: item.data.comment,
                updated_at: new Date()
              }
            })
          ))
        }) as example_reviews[]
        updatedCount += updatedRows.length
        result.updated.push(...updatedRows)
        logger.debug('Chunk de updates ejecutado', { chunkSize: chunk.length, updatedInChunk: updatedRows.length })
      }
    }

    // Retrieve created objects (optional)
    if (toCreate.length > 0) {
      const createdCandidates = await ReviewsModel.findReviewsByFilter(
        Array.from(new Set(toCreate.map(r => r.location_id))),
        Array.from(new Set(toCreate.map(r => r.author_name))),
        Array.from(new Set(toCreate.map(r => r.review_time)))
      )
      const createdMap = new Map<string, example_reviews>()
      for (const cr of createdCandidates) {
        const reviewTimeStr = cr.review_time 
          ? (cr.review_time instanceof Date ? cr.review_time.toISOString() : new Date(cr.review_time).toISOString())
          : new Date().toISOString()
        const k = `${cr.location_id}||${cr.author_name}||${reviewTimeStr}`
        if (!createdMap.has(k)) createdMap.set(k, cr)
      }
      for (const r of toCreate) {
        const reviewTimeStr = r.review_time instanceof Date ? r.review_time.toISOString() : new Date(r.review_time).toISOString()
        const k = `${r.location_id}||${r.author_name}||${reviewTimeStr}`
        const found = createdMap.get(k)
        if (found) result.created.push(found)
      }
    }

    logger.debug('Sincronización de reseñas completada', { savedCount, updatedCount })
    return { savedCount, updatedCount, ...result }
  } catch (err) {
    logger.error('Error en syncReviewsBatchAndPersist', err)
    throw err
  }
}

/**
 * Formats reviews as messages for OpenAI conversation
 * Combines all reviews into a single message to avoid the 20-item limit in createConversation
 * @param reviews - Array of Google My Business reviews to format
 * @returns Promise resolving to array with a single message containing all reviews combined
 */
export async function formatReviewsAsMessages(reviews: GoogleMyBusinessReview[]): Promise<Array<{ role: string; content: string }>> {
  const ratingMap: Record<string, string> = {
    'ONE': '1 estrella',
    'TWO': '2 estrellas',
    'THREE': '3 estrellas',
    'FOUR': '4 estrellas',
    'FIVE': '5 estrellas'
  }

  // Combine all reviews into a single message content
  const combinedContent = reviews.map((review, index) => {
    const rating = ratingMap[review.starRating] || 'Sin calificación'
    const author = review.reviewer?.displayName || 'Usuario Anónimo'
    const comment = review.comment || 'Sin comentario'
    const response = review.reviewReply?.comment || null
    const date = new Date(review.createTime).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    let reviewText = `\n\n--- Reseña ${index + 1} ---\n`
    reviewText += `Autor: ${author}\n`
    reviewText += `Calificación: ${rating}\n`
    reviewText += `Fecha: ${date}\n`
    reviewText += `Comentario: ${comment}\n`
    if (response) {
      reviewText += `Respuesta del negocio: ${response}\n`
    }

    return reviewText
  }).join('')

  // Return a single message with all reviews combined
  return [{
    role: 'user',
    content: `Reseñas del negocio:${combinedContent}`
  }]
}

/**
 * Generates a summary of reviews using OpenAI with rate limit protection
 * @param reviews - Array of Google My Business reviews to summarize
 * @param globalRateLimitState - Optional shared state to coordinate cooldowns across callers
 * @param rateLimitTracker - Optional object to track when rate limits occur
 * @returns Summary string or empty string on error
 */
async function generateReviewsSummary(
  reviews: GoogleMyBusinessReview[],
  globalRateLimitState?: GlobalRateLimitState,
  rateLimitTracker?: { hasRateLimit: boolean }
): Promise<string> {
  if (!reviews || reviews.length === 0) {
    return ''
  }

  try {
    logger.debug('Generating reviews summary', { reviewCount: reviews.length })

    const messages = await formatReviewsAsMessages(reviews)
    
    const conversationId = await OpenAIConversations.createConversation(messages)
    
    const globalConfig = await GlobalConfigModel.findActive()
    let summaryModel: string = APP_CONSTANTS.openAi.models.defaultSummary
    let summaryMaxTokens: number = APP_CONSTANTS.openAi.request.summaryMaxTokens

    if (globalConfig) {
      if (globalConfig.responder_model) {
        summaryModel = globalConfig.responder_model as string
      }
      if (globalConfig.responder_max_tokens) {
        summaryMaxTokens = globalConfig.responder_max_tokens as number
      }
    }

    const summary = await safeCall(
      async () => {
        return await summarizeMessages(
          conversationId,
          summaryModel,
          summaryMaxTokens * APP_CONSTANTS.openAi.request.summaryModelMultiplier,
          'reviews'
        )
      },
      APP_CONSTANTS.openAi.rateLimit.retryAttempts,
      undefined,
      rateLimitTracker,
      globalRateLimitState
    )
    
    logger.debug('Reviews summary generated', { 
      reviewCount: reviews.length,
      summaryLength: summary.length 
    })

    return summary
  } catch (error) {
    logger.error('Error generating reviews summary', error)
    return ''
  }
}

/**
 * Calcula analytics ligeros sobre un conjunto de reseñas de GMB
 */
function calculateAnalytics(allReviews: GoogleMyBusinessReview[]) {
  const reviewsWithResponses = allReviews.filter(r => r.reviewReply?.comment).length
  const averageRating = allReviews.length > 0
    ? allReviews.reduce((sum, r) => {
        const ratingMap: Record<string, number> = { 'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5 }
        return sum + (ratingMap[r.starRating] || 0)
      }, 0) / allReviews.length
    : 0

  const recentReviews = allReviews
    .slice()
    .sort((a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime())
    .slice(0, APP_CONSTANTS.analytics.recentReviewsLimit)
    .map(r => ({
      author: r.reviewer?.displayName || 'Usuario Anónimo',
      rating: { 'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5 }[r.starRating] || 0,
      comment: previewString(r.comment, APP_CONSTANTS.analytics.recentReviewCommentPreview) || null,
      createTime: r.createTime,
      hasResponse: !!r.reviewReply?.comment
    }))

  return {
    reviewsWithResponses,
    averageRating: Math.round(averageRating * 100) / 100,
    recentReviews
  }
}

/**
 * Server action para procesar reseñas de Google My Business
 * @param user - Clerk User object
 * @param googleAccessToken - Optional pre-fetched Google access token (recommended for API routes)
 * @param filters - Filtros opcionales para las reseñas
 * @returns Resultado del procesamiento de reseñas
 */
export async function processGoogleReviews(
  clerkUserId: string,
  filters: ReviewFilters = {}
): Promise<ProcessReviewsResult> {
  try {
    // ask if clerkUserId exists
    const user = await UsersModel.findUserByClerkId(clerkUserId)
    if (!user) {
      logger.debug('User not found', { clerkUserId })
      return {} as ProcessReviewsResult
    }
    
    logger.debug('Processing Google reviews for user', { userId: clerkUserId, filters })
    const accessToken = await getGoogleAccessToken(clerkUserId)
    if (!accessToken.success || !accessToken.token) {
      throw new Error('Token de acceso de Google no encontrado', { cause: accessToken })
    }

    // Resolver usuario interno por Clerk ID
    const dbUser = await UsersModel.findUserByClerkId(clerkUserId)
    if (!dbUser) {
      throw new Error('Usuario no encontrado en la base de datos')
    }

    // Build the location filter and fetch locations
    const whereClause = buildLocationWhereClause(dbUser.id, filters)


    // limit to max locations
    const locations = await LocationsModel.findFilteredLocations(whereClause, APP_CONSTANTS.gmb.maxLocationsLimit)

    if (!locations || locations.length === 0) {
      throw new Error('No se encontraron ubicaciones. Primero ejecuta la API de ubicaciones.')
    }

    logger.debug('Ubicaciones encontradas', {
      count: locations.length,
      maxReviewsPerLocation: APP_CONSTANTS.gmb.maxReviewsPerLocation,
      note: 'Limitado para evitar timeouts en Vercel'
    })

    /** process all reviews for all locations using a promise.all */
    const reviews = await Promise.all(locations.map(async (location) => {
      try {
        let locationReviews: GoogleMyBusinessReview[] = []
        if (location.status === 'active') {
          locationReviews = await GmbReviewsModel.processLocationReviews(location, accessToken.token as string, APP_CONSTANTS.gmb.maxReviewsPerLocation)
        }

        if (locationReviews.length === 0) {
          return { locationReviews: [], reviewsToSave: [], locationId: location.id }
        }

        const reviewsToSave = convertReviewsToSaveFormat(locationReviews, location.id)
        return { locationReviews, reviewsToSave, locationId: location.id }
      } catch (error) {
        logger.error('Error procesando ubicación', error)
        return { locationReviews: [], reviewsToSave: [], locationId: location.id }
      }
    }))

    const allReviewsToSave = reviews.map(review => review.reviewsToSave).flat()
    const allReviews = reviews.map(review => review.locationReviews).flat()

    logger.debug('📊 RESUMEN FINAL del procesamiento de ubicaciones', {
      totalLocations: locations.length,
      processed: reviews.length,
    })

    // Persist data and compute analytics
    const { savedCount: savedReviewsCount, updatedCount: updatedReviewsCount } = await syncReviewsBatchAndPersist({
      reviewsToSave: allReviewsToSave,
      createChunkSize: APP_CONSTANTS.database.batch.createChunkSize,
      updateChunkSize: APP_CONSTANTS.database.batch.updateChunkSize
    })

    logger.debug('Proceso completado', {
      locationsProcessed: locations.length,
      reviewsObtained: allReviews.length,
      reviewsCreated: savedReviewsCount,
      reviewsUpdated: updatedReviewsCount,
      totalReviewsProcessed: savedReviewsCount + updatedReviewsCount
    })

    // Generate summaries and create prompt contexts for all locations
    // Use shared global rate limit state to coordinate cooldowns across parallel calls
    const globalRateLimitState: GlobalRateLimitState = { cooldownUntil: 0 }
    const locationSummaries = await Promise.all(
      reviews.map(async (reviewData) => {
        const location = locations.find(l => l.id === reviewData.locationId)
        if (!location || !reviewData.locationReviews || reviewData.locationReviews.length === 0) {
          return { locationId: reviewData.locationId, summary: null }
        }

        try {
          const rateLimitTracker = { hasRateLimit: false }
          const reviewsSummary = await generateReviewsSummary(
            reviewData.locationReviews,
            globalRateLimitState,
            rateLimitTracker
          )
          return { locationId: reviewData.locationId, summary: reviewsSummary || null }
        } catch (summaryError) {
          logger.error('Error generating summary for location', {
            error: summaryError,
            locationId: reviewData.locationId
          })
          return { locationId: reviewData.locationId, summary: null }
        }
      })
    )

    // Create prompt contexts with summaries at the end
    try {
      await PromptContextModel.upsertSummaries(locationSummaries)
      locationSummaries.forEach(({ locationId, summary }) => {
        logger.debug('Created/updated prompt context with reviews summary', {
          locationId,
          summaryLength: summary?.length || 0
        })
      })
    } catch (error) {
      logger.error('Error creating prompt contexts', {
        error,
        locations: locationSummaries.map(entry => entry.locationId)
      })
    }

    const analytics = calculateAnalytics(allReviews)

    // Send WhatsApp developer message after processing reviews (non-blocking)
    if (dbUser.wa_id) {
      try {
        // Get the latest session for the user to check agent_managed
        const userSession = await SessionsModel.findSessionByUserId(dbUser.id)
        
        // Only send message if session exists and agent_managed is true
        if (userSession?.agent_managed === true) {
          // Get user email from database
          const userEmail = dbUser.email || 'N/A'

          // Get organization if exists
          const organizationId = dbUser.organization_id

          // Check if user has Google auth (we already have accessToken, so if we got here, auth exists)
          const hasGoogleAuth = !!accessToken.success && !!accessToken.token

          // Get active locations with prompt context for the message
          let activeLocationsWithPromptContext: Array<locations & { prompt_context: { responses_summary: string | null } | null }> = []
          if (organizationId) {
            activeLocationsWithPromptContext = await LocationsModel.findActiveLocationsByOrganizationIdWithPromptContext(organizationId)
          } else {
            activeLocationsWithPromptContext = await LocationsModel.findActiveLocationsWithPromptContext(dbUser.id)
          }

          const activeLocationsCount = activeLocationsWithPromptContext.length

          // Build locations mapping with reference:name:reviews_summary format
          const locationsMapping = activeLocationsWithPromptContext
            .filter(loc => loc.name) // Only include locations with names
            .map(loc => `reference: ${loc.reference ?? 'N/A'}, name: ${loc.name}, reviews_summary: ${loc.prompt_context?.responses_summary ?? 'N/A'}\n`)
            .join('')

          const onboardingCompleteMessage = 
            `Onboarding process completed successfully.\n` +
            `User: ${dbUser.name || dbUser.username || 'User'},\n` +
            `Email: ${userEmail},\n` +
            `Google Connection: ${hasGoogleAuth ? 'Configured' : 'Not configured'}.\n` +
            `Locations: ${activeLocationsCount}\n` +
            `User locations:\n${locationsMapping}` +
            `Event: onboarding complete.\n` +
            `The user is ready to use the system.\n`

          await sendDeveloperMessage(
            onboardingCompleteMessage,
            dbUser.wa_id
          ).catch(error => {
            // Log error but don't block the process
            logger.error('Failed to send developer message after reviews processing (non-blocking)', error)
          })
        } else {
          logger.debug('Skipping developer message: session not found or agent_managed is false', {
            userId: dbUser.id,
            hasSession: !!userSession,
            agentManaged: userSession?.agent_managed
          })
        }
      } catch (error) {
        // Log error but don't block the process
        logger.error('Error preparing WhatsApp message after reviews processing (non-blocking)', error)
      }
    }

    return {
      reviews: allReviews,
      savedReviews: savedReviewsCount,
      updatedReviews: updatedReviewsCount,
      totalReviews: allReviews.length,
      locations: locations.map(l => ({ id: l.id, name: l.name, google_location_id: l.google_location_id })),
      summary: {
        totalReviews: allReviews.length,
        ...analytics
      },
      apiInfo: {
        version: 'Google My Business API v4',
        endpoint: 'mybusiness.googleapis.com/v4',
        method: 'Individual location reviews',
        locationsProcessed: locations.length
      },
      message: `Se procesaron ${allReviews.length} reseñas de ${locations.length} ubicaciones. ${savedReviewsCount} reseñas creadas, ${updatedReviewsCount} actualizadas.`
    }

  } catch (error) {
    logger.error('Error in processGoogleReviews server action:', error)
    
    return {
      reviews: [],
      savedReviews: 0,
      updatedReviews: 0,
      totalReviews: 0,
      locations: [],
      summary: {
        totalReviews: 0,
        reviewsWithResponses: 0,
        averageRating: 0,
        recentReviews: []
      },
      apiInfo: {
        version: 'Google My Business API v4',
        endpoint: 'mybusiness.googleapis.com/v4',
        method: 'Individual location reviews',
        locationsProcessed: 0
      },
      message: error instanceof Error ? error.message : 'Error desconocido al procesar reseñas'
    }
  }
}

/**
 * Server action para obtener reseñas guardadas de un usuario
 * @param clerkUserId - ID del usuario en Clerk
 * @returns Reseñas guardadas del usuario
 */
export async function getUserReviews(clerkUserId: string): Promise<{ reviews: example_reviews[]; totalReviews: number }> {
  try {
    logger.debug('Getting user reviews for', { userId: clerkUserId })
    
    const dbUser = await UsersModel.findUserByClerkId(clerkUserId)
    if (!dbUser) {
      throw new Error('Usuario no encontrado en la base de datos')
    }

    const reviews = await ReviewsModel.findByUserId(dbUser.id)
    
    return {
      reviews,
      totalReviews: reviews.length
    }
  } catch (error) {
    logger.error('Error in getUserReviews server action:', error)
    
    return {
      reviews: [],
      totalReviews: 0
    }
  }
}

/**
 * Server action para sincronizar solo reseñas sin procesar ubicaciones
 * @param accessToken - Token de acceso de Google
 * @param clerkUserId - ID del usuario en Clerk
 * @param filters - Filtros opcionales para las reseñas
 * @returns Resultado de la sincronización
 */
export async function syncReviewsOnly(
  accessToken: string,
  clerkUserId: string,
  filters: ReviewFilters = {}
): Promise<SyncReviewsResult> {
  try {
    logger.debug('Syncing reviews only for user', { userId: clerkUserId })

    const dbUser = await UsersModel.findUserByClerkId(clerkUserId)
    if (!dbUser) {
      throw new Error('Usuario no encontrado en la base de datos')
    }

    const whereClause = buildLocationWhereClause(dbUser.id, filters)
    const locations = await LocationsModel.findFilteredLocations(whereClause)

    if (!locations || locations.length === 0) {
      throw new Error('No se encontraron ubicaciones. Primero ejecuta la API de ubicaciones.')
    }

    const allReviews: GoogleMyBusinessReview[] = []
    const allReviewsToSave: ReviewToSave[] = []

    for (const location of locations) {
      try {
        const locationReviews = await GmbReviewsModel.processLocationReviews(
          {
            id: location.id,
            name: location.name,
            google_location_id: location.google_location_id,
            connections: (location as LocationWithConnections).connections ? {
              id: (location as LocationWithConnections).connections!.id,
              external_account_id: (location as LocationWithConnections).connections!.external_account_id
            } : null
          },
          accessToken,
          APP_CONSTANTS.gmb.maxReviewsPerLocation
        )
        const reviewsToSave = convertReviewsToSaveFormat(locationReviews, location.id)

        allReviews.push(...locationReviews)
        allReviewsToSave.push(...reviewsToSave)
      } catch (locationError) {
        logger.error(`Error procesando ubicación ${location.id}`, locationError)
      }
    }

    const result = await syncReviewsBatchAndPersist({
      reviewsToSave: allReviewsToSave,
      createChunkSize: APP_CONSTANTS.database.batch.createChunkSize,
      updateChunkSize: APP_CONSTANTS.database.batch.updateChunkSize
    })

    return {
      ...result,
      analytics: {
        locationsWithWebsite: 0,
        locationsWithPhone: 0,
        locationsWithHours: 0,
        locationsWithAddress: 0,
        locationsWithCoordinates: 0,
        completenessScore: 0
      }
    }

  } catch (error) {
    logger.error('Error in syncReviewsOnly server action:', error)
    throw error
  }
}

// function to send reviews to gmb
//reviews to send has response, review_url, token
export interface ReviewToSendToGmb {
  review_url: string
  response: string
  token: string
  location_id?: string | null
  reviewer_name?: string | null
  rating?: string | null
  comment?: string | null
  create_time?: string | Date | null
  instructions?: string | null
  prompt_context_tone?: string | null
  prompt_context_handle_one_star?: string | null
  prompt_context_instructions?: string | null
}

export interface SendReviewsToGmbResult {
  success: boolean
  message: string
  reviews: ReviewToSendToGmb[]
}

export async function sendReviewsToGmb(reviews: ReviewToSendToGmb[]): Promise<SendReviewsToGmbResult> {
  try {
    logger.debug('Sending reviews to GMB', { reviews: reviews.length })
    if (!Array.isArray(reviews) || reviews.length === 0) {
      return {
        success: false,
        message: 'No se proporcionaron reseñas para enviar',
        reviews: []
      }
    }

    // const isProduction = globalConfiguration.isProduction
    // at this point we need always in dev
    const isProduction = false
    if (!isProduction) {
      logger.debug('Entorno no producción detectado, guardando respuestas en reviews_responses_test', {
        count: reviews.length
      })

      await prisma.reviews_responses_test.createMany({
        data: reviews.map((review) => ({
          location_id: review.location_id ?? null,
          reviewer_name: review.reviewer_name || 'Unknown',
          rating: review.rating || '0',
          comment: review.comment ?? null,
          create_time: review.create_time ? new Date(review.create_time) : null,
          response: review.response ?? null,
          instructions: review.instructions ?? null,
          prompt_context_tone: review.prompt_context_tone ?? null,
          prompt_context_handle_one_star: review.prompt_context_handle_one_star ?? null,
          prompt_context_instructions: review.prompt_context_instructions ?? null
        }))
      })

      return {
        success: true,
        message: `Se almacenaron ${reviews.length} respuestas en reviews_responses_test (entorno no producción)`,
        reviews
      }
    }
    
    const maxBatchSize = Math.min(APP_CONSTANTS.gmb.maxBatchSizeGmb, reviews.length)
    const queue = [...reviews]
    let currentBatchSize = maxBatchSize
    let rateLimitEvents = 0
    const allResults: PromiseSettledResult<void>[] = []

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
    
    async function sendReviewWithRetry(review: ReviewToSendToGmb, rateLimitTracker: { hasRateLimit: boolean }) {
      if (!review.review_url) {
        throw new Error('Falta review_url para enviar respuesta')
      }
      if (!review.token) {
        throw new Error('Falta token para enviar respuesta')
      }
      if (!review.response) {
        throw new Error('Falta respuesta generada para enviar a GMB')
      }

      const requestUrl = review.review_url.startsWith('http')
        ? review.review_url
        : `https://mybusiness.googleapis.com/v4/${review.review_url.replace(/^\/+/, '')}`

      await safeCall(async () => {
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${review.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ comment: review.response }),
          signal: AbortSignal.timeout(APP_CONSTANTS.gmb.requestTimeout)
        })

        if (!response.ok) {
          const errorText = await response.text()
          const err = new Error(`Google My Business API error ${response.status}: ${errorText}`)
          ;(err as { status?: number }).status = response.status
          throw err
        }

        return true
      }, APP_CONSTANTS.gmb.retryAttempts, undefined, rateLimitTracker)
    }

    while (queue.length > 0) {
      const previousBatchSize = currentBatchSize
      const chunk = queue.splice(0, currentBatchSize)
      const chunkRateLimitTracker = { hasRateLimit: false }

      const chunkResults = await Promise.allSettled(
        chunk.map(review => sendReviewWithRetry(review, chunkRateLimitTracker))
      )

      allResults.push(...chunkResults)

      if (chunkRateLimitTracker.hasRateLimit) {
        rateLimitEvents += 1
        currentBatchSize = Math.max(1, Math.floor(currentBatchSize / 2))
        logger.debug('Rate limit detectado al enviar respuestas a GMB, ajustando concurrencia', {
          previousBatchSize,
          newBatchSize: currentBatchSize,
          remainingReviews: queue.length
        })
        await delay(APP_CONSTANTS.gmb.rateLimitDelayBase * Math.max(1, currentBatchSize))
      } else if (currentBatchSize < maxBatchSize) {
        currentBatchSize = Math.min(maxBatchSize, currentBatchSize + 1)
      }
    }

    const rejected = allResults.filter((result): result is PromiseRejectedResult => result.status === 'rejected')

    if (rejected.length > 0) {
      rejected.forEach((rejection, index) => {
        logger.error('Fallo al enviar respuesta a GMB', { error: rejection.reason, reviewIndex: index })
      })

      return {
        success: false,
        message: `Se enviaron ${reviews.length - rejected.length} respuestas, ${rejected.length} fallaron${rateLimitEvents ? `. Eventos de rate limit manejados: ${rateLimitEvents}` : ''}`,
        reviews
      }
    }

    if (rateLimitEvents > 0) {
      logger.debug('Respuestas a GMB enviadas con eventos de rate limit controlados', {
        rateLimitEvents,
        totalReviews: reviews.length
      })
    }

    return {
      success: true,
      message: `Se enviaron correctamente ${reviews.length} respuestas a Google My Business${rateLimitEvents ? `. Eventos de rate limit manejados: ${rateLimitEvents}` : ''}`,
      reviews
    }
  } catch (error) {
    logger.error('Error in sendReviewsToGmb server action:', error)
    throw error
  }
}
