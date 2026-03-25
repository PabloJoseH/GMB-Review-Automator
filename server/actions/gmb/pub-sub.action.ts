/**
 * GMB Pub/Sub Actions - Server Actions for Google My Business Pub/Sub
 * Overview:
 * - Fetch pending Pub/Sub notifications and correlate them with active locations
 * - Fetch Google reviews for matching notifications
 * - Build prompt context and generate responses with OpenAI
 * - Persist responses and acknowledge processed notifications
 * - Create a `pub_sub_log` entry capturing: reject, process, errors, not_manage, asked
 * - Increment `locations.reviews_processed` for each active location by newly processed count
 */


'use server'

import { GmbPubSubModel, DecodedPubSubMessage } from "@/server/models/gmb/pub-sub.model"
import { LocationsModel, LocationWithConnectionUserAndPromptContext } from "@/server/models/supabase/locations.model"
import { getGoogleAccessToken } from "@/server/actions/clerk/users.action"
import { GmbReviewsModel, GoogleMyBusinessReview } from "@/server/models/gmb/reviews.model"
import { OpenAIResponseOutput, generateResponse } from "@/server/models/openAI/response.model"
import { ConnectionsModel } from "@/server/models/supabase/connections.model"
import { UsersModel } from "@/server/models/supabase/users.model"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import type { PaginatedApiResponse } from "@/lib/api-types"
import { sendWhatsAppTemplateAction } from "@/server/actions/whatsapp/sendMessage.action"
import pLimit from "p-limit"
import { safeCall, type GlobalRateLimitState } from "@/lib/api-helpers"
import { sendReviewsToGmb } from "@/server/actions/gmb/reviews.action"
import { APP_CONSTANTS } from "@/lib/constants"
import { getAuthenticatedDatabaseUserId } from "@/lib/server-action-auth"

const logger = createLogger('GmbPubSubAction')

async function isAuthenticatedUserId(userId: string): Promise<boolean> {
    const { dbUserId } = await getAuthenticatedDatabaseUserId()
    return dbUserId === userId
}

/**
 * Helper function to send WhatsApp notification to user when credentials need to be reconnected
 * @param clerkId - User's Clerk ID
 * @param userId - User's database ID
 */
async function sendWhatsAppCredentialsNotification(clerkId: string, userId: string): Promise<void> {
    try {
        const dbUser = await UsersModel.findUserByClerkId(clerkId)
        if (dbUser && dbUser.wa_id) {
            const templateResult = await sendWhatsAppTemplateAction(userId, {
                template_type: 'sign_in',
                locale: 'es',
                reauth: true
            })

            if ('error' in templateResult) {
                logger.error('Failed to send WhatsApp template to user requesting credentials reconnection', {
                    error: templateResult.error,
                    userId: dbUser.id,
                    wa_id: dbUser.wa_id,
                    clerk_id: clerkId
                })
            } else {
                logger.debug('Sent WhatsApp template to user requesting credentials reconnection', {
                    userId: dbUser.id,
                    wa_id: dbUser.wa_id,
                    clerk_id: clerkId,
                    messageId: templateResult.messageId,
                    url: templateResult.url
                })
            }
        } else {
            logger.debug('User not found or missing wa_id for credentials notification', {
                clerk_id: clerkId,
                db_user_id: dbUser?.id
            })
        }
    } catch (error) {
        logger.error('Failed to send WhatsApp template to user requesting credentials reconnection', error)
    }
}

/**
 * Helper function to send WhatsApp notification to users with new proposed responses
 * Groups reviews by user to send a single notification per user
 * @param userIdToResponsesCount - Map of user IDs to count of new proposed responses
 */
async function sendWhatsAppProposedResponsesNotification(
    userIdToResponsesCount: Map<string, number>
): Promise<void> {
    try {
        // Get all unique user IDs
        const userIds = Array.from(userIdToResponsesCount.keys())
        
        if (userIds.length === 0) {
            logger.debug('No users to notify about proposed responses')
            return
        }
        
        // Send template notifications in parallel (with error handling per user)
        const notificationPromises = userIds.map(async (userId) => {
            const responsesCount = userIdToResponsesCount.get(userId) || 0

            if (responsesCount === 0) {
                logger.debug('Response count is 0 for user', { user_id: userId })
                return
            }

            try {
                const templateResult = await sendWhatsAppTemplateAction(userId, {
                    template_type: 'proposed_responses',
                    locale: 'es'
                })

                if ('error' in templateResult) {
                    logger.error('Failed to send WhatsApp template to user about proposed responses', {
                        error: templateResult.error,
                        userId
                    })
                } else {
                    logger.debug('Sent WhatsApp template to user about new proposed responses', {
                        userId,
                        responsesCount,
                        messageId: templateResult.messageId,
                        url: templateResult.url
                    })
                }
            } catch (error) {
                logger.error('Failed to send WhatsApp template to user about proposed responses', {
                    error,
                    userId
                })
            }
        })
        
        await Promise.all(notificationPromises)
    } catch (error) {
        logger.error('Failed to send WhatsApp notifications about proposed responses', error)
    }
}

interface GoogleReviewToProcess extends GoogleMyBusinessReview {
  locationId: string
  accountId: string
  promptContext: {
    tone?: string
    response_length?: string
    use_emojis?: boolean
    cta?: string
    language?: string
    on_5_star?: string
    on_4_star?: string
    on_3_star?: string
    on_2_star?: string
    on_1_star?: string
  }
  ackId: string
}

/**
 * Recursively searches for a 'reply' field in a JSON object
 * @param obj - The object to search in
 * @returns The value of the 'reply' field if found, null otherwise
 */
function findReplyInObject(obj: unknown): string | null {
  // If obj is not an object or is null, return null
  if (typeof obj !== 'object' || obj === null) {
    return null
  }

  // If the current object has a 'reply' property and it's a string, return it
  if ('reply' in obj && typeof (obj as Record<string, unknown>).reply === 'string') {
    return (obj as Record<string, unknown>).reply as string
  }

  // If obj is an array, search in each element
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findReplyInObject(item)
      if (result !== null) {
        return result
      }
    }
  } else {
    // If obj is an object, search in each property value
    const record = obj as Record<string, unknown>
    for (const key in record) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        const result = findReplyInObject(record[key])
        if (result !== null) {
          return result
        }
      }
    }
  }

  return null
}

/**
 * Process a single review and generate OpenAI response
 * @param review - The review to process
 * @param locationsWithMatchingNotifications - Array of locations to find the matching location
 * @param instructions - OpenAI instructions
 * @param model - OpenAI model to use
 * @param maxTokens - Maximum tokens for the response
 * @param responseFormat - Response format for OpenAI
 * @param errorTracker - Object to track errors (mutated internally)
 * @param rateLimitTracker - Optional object to track when rate limits occur (mutated internally)
 * @returns Processed response with review, OpenAI response, location DB ID, and ack ID, or null if processing fails
 */
async function processSingleReviewWithOpenAI(
  review: GoogleReviewToProcess,
  locationsWithMatchingNotifications: LocationWithConnectionUserAndPromptContext[],
  instructions: string,
  model: string,
  maxTokens: number,
  responseFormat: string,
  errorTracker: { errorCount: number; errorTypes: string[] },
  rateLimitTracker?: { hasRateLimit: boolean },
  globalRateLimitState?: GlobalRateLimitState
): Promise<{ review: GoogleReviewToProcess; openaiResponse: OpenAIResponseOutput; locationDbId: string; ackId: string } | null> {
  if (!instructions) {
    logger.debug('Review comment or instructions not found for review: ' + review.reviewId)
    return null
  }
  
  const thislocation = locationsWithMatchingNotifications.find(loc => loc.google_location_id === review.locationId)
  
  // Build prompt context based on new schema structure
  const promptContextInstructions = [
    `Tone: ${review.promptContext.tone || 'professional'}`,
    `Response Length: ${review.promptContext.response_length || 'medium'}`,
    `Use Emojis: ${review.promptContext.use_emojis ? 'Yes' : 'No'}`,
    review.promptContext.cta ? `Call to Action: ${review.promptContext.cta}` : '',
    `Language: ${review.promptContext.language || 'english'}`,
    `Action for ${review.starRating} star rating: ${review.promptContext[`on_${review.starRating.toLowerCase()}_star` as keyof typeof review.promptContext] || 'reply'}`
  ].filter(Boolean).join('\n')

  const userResponse = [
    {
      role: 'developer',
      content: promptContextInstructions
    },
    {
      role: 'location',
      name: thislocation?.name || 'Unknown',
      category: thislocation?.primary_category || 'Unknown',
      ubication: thislocation?.country + ', ' + thislocation?.city|| 'Unknown',
      oficial_website: thislocation?.website || 'Unknown',
      phone: thislocation?.phone || 'Unknown',
    },
    {
      role: 'user',
      reviewerName: review.reviewer.displayName || 'Anonymous',
      date: review.updateTime ? new Date(review.updateTime) : new Date(),
      rating: review.starRating,
      content: review.comment
    }
  ]
  const userResponseString = JSON.stringify(userResponse)
  
  let openaiResponse: OpenAIResponseOutput
  try {
    openaiResponse = await safeCall(async () => {
      return await generateResponse({
        userResponse: userResponseString || 'No comment found, rating: ' + review.starRating,
        promptContext: promptContextInstructions,
        instructions: instructions,
        model: model,
        temperature: 0,
        maxTokens: maxTokens,
        responseFormat: responseFormat
      })
    }, APP_CONSTANTS.openAi.rateLimit.retryAttempts, undefined, rateLimitTracker, globalRateLimitState)
  } catch (err) {
    errorTracker.errorCount += 1
    errorTracker.errorTypes.push('openai_generation_error')
    logger.error('OpenAI generation error', { reviewId: review.reviewId, err })
    return null
  }
  
  // Try to parse the OpenAI response as JSON to extract the reply field
  try {
    const openaiResponseObject = JSON.parse(openaiResponse.response)
    const reply = findReplyInObject(openaiResponseObject)
    if (reply) {
      openaiResponse.response = reply
    } else {
      logger.debug('Reply field not found in OpenAI response for review: ' + review.reviewId)
    }
  } catch (parseError) {
    // If parsing fails, log the error and use the original response as-is
    logger.error('Failed to parse OpenAI response as JSON for review: ' + review.reviewId, { 
      error: parseError,
      response: openaiResponse.response
    })
    // Keep the original response without modification
    errorTracker.errorTypes.push('openai_parse_error')
    errorTracker.errorCount += 1
  }
  
  // Find the location db id (UUID) from locationsWithMatchingNotifications
  // This is the locations.id (UUID), NOT the google_location_id
  const location = locationsWithMatchingNotifications.find(loc => loc.google_location_id === review.locationId)
  
  return {
    review: review,
    openaiResponse,
    locationDbId: location?.id || '',
    ackId: review.ackId
  }
}

async function getPubSubNotifications() {
    try {
        // get notifications from pub/sub
        const notifications = await GmbPubSubModel.getNotifications()
        // return notifications
        return {
            success: true,
            error: null,
            data: notifications
        }
    } catch (error) {
        logger.error('Error getting Pub/Sub notifications', error)
        return {
            success: false,
            error: error,
            data: [] as DecodedPubSubMessage[]
        }
    }
}

// return two arrays, not matching and matching

function checkIfNotificationsAreForLocations(notifications: DecodedPubSubMessage[], locations: LocationWithConnectionUserAndPromptContext[]): { notMatching: DecodedPubSubMessage[], matching: DecodedPubSubMessage[], locationsWithMatchingNotifications: LocationWithConnectionUserAndPromptContext[] } {
    const notMatching = [] as DecodedPubSubMessage[]
    const matching = [] as DecodedPubSubMessage[]
    const locationsWithMatchingNotifications = [] as LocationWithConnectionUserAndPromptContext[]
    for (const notification of notifications) {
        const location = locations.find(location => location.google_location_id === notification.message.data.locationId)
        if (location) {
            matching.push(notification)
            // add location if not already in the array
            if (!locationsWithMatchingNotifications.some(l => l.id === location.id)) {
                locationsWithMatchingNotifications.push(location)
            }
        } else {
            notMatching.push(notification)
        }
    }
    return { notMatching, matching, locationsWithMatchingNotifications }
}

export async function processPubSubNotifications() {
    // get notifications from pub/sub simultaneously in 10 parallel requests using Promise.all
    // if one request return an empty array stop the process
    // if all requests returns something do another parallel request for the next 10 notifications
    // repeat to a max of 5 times
    // process notifications
    // save all notifications in an array
    logger.debug('Processing Pub/Sub notifications')

    // get Global configuration from prisma
    const globalConfiguration = await prisma.global_config.findFirst({
        where: {
            active: true,
        }
    })

    let instructions = process.env.instructions
    let model: string = APP_CONSTANTS.openAi.models.defaultSummary
    let maxTokens: number = APP_CONSTANTS.openAi.request.defaultMaxTokens
    let responseFormat = ''
    if (globalConfiguration) {
        if (globalConfiguration.responder_instructions) {
            instructions = globalConfiguration.responder_instructions as string
        }
        if (globalConfiguration.responder_model) {
            model = globalConfiguration.responder_model as string
        }
        if (globalConfiguration.responder_max_tokens) {
            maxTokens = globalConfiguration.responder_max_tokens as number
        }
        if (globalConfiguration.responder_response_format) {
            responseFormat = globalConfiguration.responder_response_format as string
        }
    }
    logger.debug('Global configuration: ')
    logger.debug('Instructions: ' + instructions)
    logger.debug('Model: ' + model)
    logger.debug('Max tokens: ' + maxTokens)
    logger.debug('Response format: ' + responseFormat)
    const allNotifications: DecodedPubSubMessage[] = []

    for (let i = 0; i < APP_CONSTANTS.pubSub.maxFetchIterations; i++) {
        // get notifications in parallel using Promise.all
        const notifications = await Promise.all(Array.from({ length: APP_CONSTANTS.pubSub.parallelFetchRequests }, async () => await getPubSubNotifications()))
        // add notifications to allNotifications
        allNotifications.push(...notifications.flatMap(notification => notification.data))
        // if one request return an empty array stop the process and is not an error
        if (notifications.some(notification => notification.data.length === 0 && notification.error === null)) break

        // if some request returns an error, wait and try again
        if (notifications.some(notification => notification.error !== null)) {
            logger.error('Error getting Pub/Sub notifications, waiting and trying again')
            await new Promise(resolve => setTimeout(resolve, APP_CONSTANTS.pubSub.retryDelayMs))
            continue
        }
    }

    logger.debug('Found ' + allNotifications.length + ' notifications')
    
    // Counters for pub/sub log (initialized early to use in canceled/paused logic)
    let rejectedNotifications = 0 // notifications for non-active/non-matching locations
    let notManagedCount = 0       // reviews configured as do_not_manage
    let askedCount = 0            // reviews configured as propose (ask)
    const errorTracker = { errorCount: 0, errorTypes: [] as string[] }
    
    // Get active locations with active or trialing subscriptions (to process)
    const locations = await LocationsModel.findActiveLocationsWithActiveSubscriptions()
    logger.debug('Found ' + locations.length + ' locations with active or trialing subscriptions')
    
    // Get active locations with canceled or paused subscriptions (to remove notifications)
    const locationsToRemove = await LocationsModel.findActiveLocationsWithCanceledOrPausedSubscriptions()
    logger.debug('Found ' + locationsToRemove.length + ' locations with canceled or paused subscriptions')
    
    // Extract Google location IDs from locations to remove
    const locationIdsToRemove = new Set(
      locationsToRemove.map(loc => loc.google_location_id).filter(Boolean) as string[]
    )
    
    // Filter out notifications for locations with canceled/paused subscriptions
    const notificationsToRemove: DecodedPubSubMessage[] = []
    const notificationsToProcess: DecodedPubSubMessage[] = []
    
    for (const notification of allNotifications) {
      const locationId = notification.message.data.locationId
      if (locationId && locationIdsToRemove.has(locationId)) {
        notificationsToRemove.push(notification)
      } else {
        notificationsToProcess.push(notification)
      }
    }
    
    // Delete notifications for locations with canceled/paused subscriptions
    if (notificationsToRemove.length > 0) {
      logger.debug(`Deleting ${notificationsToRemove.length} notifications for locations with canceled/paused subscriptions`)
      try {
        if (process.env.NODE_ENV === 'production') {
          GmbPubSubModel.deleteNotifications(
            notificationsToRemove.map(notification => ({ ackId: notification.ackId }))
          )
          logger.debug('Deleted notifications for canceled/paused subscriptions')
        } else {
          logger.debug(`Skipping deletion of ${notificationsToRemove.length} notifications (not in production)`)
        }
        rejectedNotifications += notificationsToRemove.length
      } catch (err) {
        errorTracker.errorCount += 1
        errorTracker.errorTypes.push('pub_sub_delete_canceled_paused_error')
        logger.error('Error deleting notifications for canceled/paused subscriptions', { err })
      }
    }
    
    // Continue processing with remaining notifications
    // split notificationsToProcess into batches
    const notificationsBatches = notificationsToProcess.reduce((acc, notification, index) => {
        const batchIndex = Math.floor(index / APP_CONSTANTS.pubSub.notificationBatchSize)
        if (!acc[batchIndex]) acc[batchIndex] = []
        acc[batchIndex].push(notification)
        return acc
    }, [] as DecodedPubSubMessage[][])

    const matchingNotifications = [] as DecodedPubSubMessage[]
    const locationsWithMatchingNotifications = [] as LocationWithConnectionUserAndPromptContext[]
    logger.debug('Processing ' + notificationsBatches.length + ' batches')

    
    // process batches in parallel
    while (notificationsBatches.length > 0) {
        // take batches to process in parallel
        const batchesToProcess = notificationsBatches.splice(0, APP_CONSTANTS.pubSub.parallelBatchProcessing)
        
        // process all batches in parallel
        const results = await Promise.all(
        batchesToProcess.map(async (notificationsBatch) => {
            const { notMatching, matching, locationsWithMatchingNotifications: newLocationsWithMatchingNotifications } = checkIfNotificationsAreForLocations(notificationsBatch, locations)
            
            // delete not matching notifications in pub/sub
            if (notMatching.length > 0) {
                GmbPubSubModel.deleteNotifications(notMatching.map(notification => ({ ackId: notification.ackId })))
                rejectedNotifications += notMatching.length
            }
            
            return { matching, newLocationsWithMatchingNotifications }
        })
        )
        
        // combine all results
        for (const result of results) {
        matchingNotifications.push(...result.matching)
        locationsWithMatchingNotifications.push(...result.newLocationsWithMatchingNotifications)
        }
    }
    logger.debug('Deleted ' + rejectedNotifications + ' notifications')
    logger.debug('Found ' + matchingNotifications.length + ' matching notifications')
    logger.debug('Found ' + locationsWithMatchingNotifications.length + ' locations with matching notifications')
    // get all user_clerk_ids from locationsWithMatchingNotifications and delete duplicates
    const userClerkIds = locationsWithMatchingNotifications.map(location => location.user.clerk_id).filter((id, index, self) => self.indexOf(id) === index) as string[]
    logger.debug('Found ' + userClerkIds.length + ' user_clerk_ids')
    // ask for the google token for each user_clerk_id in parallel
    // create a map of location_id and google token
    const googleTokensMap = new Map<string, string>()
    if (userClerkIds.length > 0) {
        const googleTokens = await Promise.all(userClerkIds.map(async (userId) => {
        const googleToken = await getGoogleAccessToken(userId)
        if (!googleToken.success || !googleToken.token) {
            // If token retrieval fails, send a WhatsApp message to the user
            // Fetch the userId from the database first
            const dbUserForNotification = await UsersModel.findUserByClerkId(userId)
            if (dbUserForNotification) {
                await sendWhatsAppCredentialsNotification(userId, dbUserForNotification.id)
            }
            return null
        }
        return { userId, googleToken: googleToken.token }
        }))
        googleTokens.forEach((googleToken) => {
        if (googleToken) {
            googleTokensMap.set(googleToken.userId, googleToken.googleToken)
        }
        })
    }
    // create a map of location_id and google token
    const locationsWithGoogleTokensMap = new Map<string, string>()
    for (const location of locationsWithMatchingNotifications) {
        const googleToken = googleTokensMap.get(location.user.clerk_id || '')
        if (googleToken && location.google_location_id) {
            locationsWithGoogleTokensMap.set(location.google_location_id, googleToken)
        }
    }
    // get google reviews in parallel with the matching notifications with a while loop
    const googleReviewsToProcess = [] as GoogleReviewToProcess[]
    while (matchingNotifications.length > 0) {
        const notificationsToProcess = matchingNotifications.splice(0, APP_CONSTANTS.pubSub.reviewFetchBatchSize)
        const googleReviews = await Promise.all(notificationsToProcess.map(async (notification) => {
            if (!notification.message.data.locationId || !locationsWithGoogleTokensMap.get(notification.message.data.locationId)) {
                //logger.debug('Notification ' + notification.message.data.locationId + ' not found in locationsWithGoogleTokensMap')
                return null
            }
            const googleReview = await GmbReviewsModel.fetchReviewById(notification.message.data.reviewId, notification.message.data.accountId, notification.message.data.locationId, locationsWithGoogleTokensMap.get(notification.message.data.locationId) || '')
            //logger.debug('Google review: ' + googleReview?.comment)
            return {googleReview, locationId: notification.message.data.locationId, accountId: notification.message.data.accountId, ackId: notification.ackId }
        }))
        // add google reviews to googleReviewsToProcess
        //logger.debug('Adding ' + googleReviews.length + ' google reviews to googleReviewsToProcess')
        //logger.debug('locationsWithMatchingNotifications: ' + JSON.stringify(locationsWithMatchingNotifications.map(location => location.google_location_id)))
        googleReviews.forEach((result) => {
            if (result && result.googleReview) {
                //logger.debug('Processing google review ' + result.googleReview.reviewId + ' for location ' + result.locationId)
                const location = locationsWithMatchingNotifications.find(location => location.google_location_id === result.locationId)
                if (location) {
                googleReviewsToProcess.push({
                    ...result.googleReview,
                    locationId: result.locationId,
                    accountId: result.accountId,
                    promptContext: {
                        tone: location.prompt_context?.tone || undefined,
                        response_length: location.prompt_context?.response_length || undefined,
                        use_emojis: location.prompt_context?.use_emojis || undefined,
                        cta: location.prompt_context?.cta || undefined,
                        language: location.prompt_context?.language || undefined,
                        on_5_star: location.prompt_context?.on_5_star || undefined,
                        on_4_star: location.prompt_context?.on_4_star || undefined,
                        on_3_star: location.prompt_context?.on_3_star || undefined,
                        on_2_star: location.prompt_context?.on_2_star || undefined,
                        on_1_star: location.prompt_context?.on_1_star || undefined
                    },
                    ackId: result.ackId
                })
                }
            } else {
                //logger.debug('Google review not found for location ' + result?.locationId)
                //logger.debug('Google review: ' + JSON.stringify(result?.googleReview))
            }
        })
    }
    logger.debug('Found ' + googleReviewsToProcess.length + ' google reviews to process')
    
    // Separate reviews to process from reviews to skip (do_not_manage)
    const reviewsToProcess = [] as GoogleReviewToProcess[]
    const reviewsToSkip = [] as { ackId: string }[]
    // Track star action per review id to compute askedCount later
    const reviewIdToStarAction = new Map<string, 'reply' | 'propose' | 'do_not_manage'>()
    
    for (const review of googleReviewsToProcess) {
      const location = locationsWithMatchingNotifications.find(loc => loc.google_location_id === review.locationId)
      
      // Skip if location or prompt_context doesn't exist
      if (!location || !location.prompt_context) {
        reviewsToSkip.push({ ackId: review.ackId })
        logger.debug('Skipping review: missing location or prompt_context', { 
          reviewId: review.reviewId, 
          hasLocation: !!location,
          hasPromptContext: !!location?.prompt_context 
        })
        continue
      }
      
      // Get the star rating action from prompt context
      const starRatingLower = review.starRating.toLowerCase()
      const actionField = starRatingLower === 'one' ? location.prompt_context.on_1_star :
                          starRatingLower === 'two' ? location.prompt_context.on_2_star :
                          starRatingLower === 'three' ? location.prompt_context.on_3_star :
                          starRatingLower === 'four' ? location.prompt_context.on_4_star :
                          location.prompt_context.on_5_star
      
      // Skip if the specific on_*_star field doesn't exist or is not set
      if (!actionField || (actionField !== 'reply' && actionField !== 'propose' && actionField !== 'do_not_manage')) {
        reviewsToSkip.push({ ackId: review.ackId })
        logger.debug('Skipping review: missing or invalid on_*_star action', { 
          reviewId: review.reviewId, 
          starRating: review.starRating,
          actionField: actionField || 'undefined'
        })
        continue
      }
      
      // Record the intended action for later logging
      if (actionField === 'propose' || actionField === 'reply' || actionField === 'do_not_manage') {
        reviewIdToStarAction.set(review.reviewId, actionField)
      }

      // Only process if action is explicitly 'reply' or 'propose'
      if (actionField === 'reply' || actionField === 'propose') {
        reviewsToProcess.push(review)
      } else {
        // This should be 'do_not_manage' at this point
        reviewsToSkip.push({ ackId: review.ackId })
        logger.debug('Skipping review with do_not_manage action', { reviewId: review.reviewId, starRating: review.starRating })
      }
    }
    
    logger.debug('Reviews to process: ' + reviewsToProcess.length + ', Reviews to skip: ' + reviewsToSkip.length)
    
    // Delete notifications for reviews that should be skipped (only in production)
    if (reviewsToSkip.length > 0) {
      if (process.env.NODE_ENV === 'production') {
        GmbPubSubModel.deleteNotifications(reviewsToSkip)
        logger.debug('Deleted notifications for ' + reviewsToSkip.length + ' do_not_manage reviews')
      } else {
        logger.debug('Skipping deletion of ' + reviewsToSkip.length + ' do_not_manage reviews (not in production)')
      }
    }
    // Count not_managed reviews for logging
    notManagedCount += reviewsToSkip.length
    
    // call the OpenAI API to respond to the google reviews using the same process
    const ResponsesToSend = [] as { review: GoogleReviewToProcess, response: OpenAIResponseOutput, locationDbId: string, ackId: string }[]
    
    // Create a limit instance with initial concurrency
    let currentLimit = APP_CONSTANTS.openAi.rateLimit.initialConcurrency as number
    let limit = pLimit(currentLimit)
    const openAiRateLimitState: GlobalRateLimitState = { cooldownUntil: 0 }
    
    while (reviewsToProcess.length > 0) {
      if (openAiRateLimitState.cooldownUntil > Date.now()) {
        const waitMs = openAiRateLimitState.cooldownUntil - Date.now()
        logger.debug(`Global rate limit cooldown active, waiting ${waitMs}ms before continuing`)
        await new Promise(resolve => setTimeout(resolve, waitMs))
        openAiRateLimitState.cooldownUntil = 0
      }

      const reviewsBatch = reviewsToProcess.splice(0, APP_CONSTANTS.pubSub.reviewProcessingBatchSize)
      // Create a shared rate limit tracker for this batch
      const rateLimitTracker = { hasRateLimit: false }
      
      const openaiResponses = await Promise.all(reviewsBatch.map((review) => {
        return limit(() => processSingleReviewWithOpenAI(
          review,
          locationsWithMatchingNotifications,
          instructions || '',
          model,
          maxTokens,
          responseFormat,
          errorTracker,
          rateLimitTracker,
          openAiRateLimitState
        ))
      }))
      
      // If rate limit occurred in this batch, reduce concurrency limit
      if (rateLimitTracker.hasRateLimit) {
        const proposedLimit = Math.max(APP_CONSTANTS.openAi.rateLimit.minConcurrency, Math.floor(currentLimit * APP_CONSTANTS.openAi.rateLimit.reductionFactor))
        if (proposedLimit !== currentLimit) {
          currentLimit = proposedLimit
          limit = pLimit(currentLimit)
        }
        logger.debug(`Rate limit detected, adjusting concurrency limit to ${currentLimit}`)
      }   
      
      // Filter out null responses and only keep valid ones with locationDbId
      const validResponses = openaiResponses.filter((response): response is NonNullable<typeof response> & { locationDbId: string } => 
        response !== null && Boolean(response.locationDbId)
      )
      
      ResponsesToSend.push(...validResponses.map(response => ({ 
        review: response.review, 
        response: response.openaiResponse, 
        locationDbId: response.locationDbId,
        ackId: response.ackId
      })))
    }
    logger.debug('Found ' + ResponsesToSend.length + ' responses to send')
    
    // Separate responses by action type (reply vs propose)
    const replyResponses = ResponsesToSend.filter(response => {
        const action = reviewIdToStarAction.get(response.review.reviewId)
        return action === 'reply'
    })
    
    const proposeResponses = ResponsesToSend.filter(response => {
        const action = reviewIdToStarAction.get(response.review.reviewId)
        return action === 'propose'
    })
    
    logger.debug(`Separated responses: ${replyResponses.length} reply, ${proposeResponses.length} propose`)
    
    // Send reply responses to Google My Business (or persist in test table for non-production)
    if (replyResponses.length > 0) {
        try {
            const reviewsToSend = replyResponses.map(response => {
                const location = locationsWithMatchingNotifications.find(loc => loc.id === response.locationDbId)
                const token = locationsWithGoogleTokensMap.get(response.review.locationId)

                if (!token) {
                    logger.error('Missing Google token for location when sending review response', {
                        locationId: response.review.locationId,
                        reviewId: response.review.reviewId
                    })
                    return null
                }

                const relativeUrl = `${response.review.accountId}/${response.review.locationId}/reviews/${response.review.reviewId}/reply`

                return {
                    review_url: relativeUrl,
                    response: response.response.response || '',
                    token,
                    location_id: response.locationDbId ?? null,
                    reviewer_name: response.review.reviewer.displayName || 'Anonymous',
                    rating: response.review.starRating === 'ONE' ? '1'
                      : response.review.starRating === 'TWO' ? '2'
                      : response.review.starRating === 'THREE' ? '3'
                      : response.review.starRating === 'FOUR' ? '4'
                      : '5',
                    comment: response.review.comment || null,
                    create_time: response.review.updateTime ? new Date(response.review.updateTime) : null,
                    instructions: instructions || null,
                    prompt_context_tone: location?.prompt_context?.tone ?? null,
                    prompt_context_handle_one_star: location?.prompt_context?.on_1_star ?? null,
                    prompt_context_instructions: response.review.promptContext ? JSON.stringify(response.review.promptContext) : null
                }
            }).filter((review): review is NonNullable<typeof review> => review !== null)

            if (reviewsToSend.length === 0) {
                logger.debug('No valid reply responses to send to GMB (missing tokens)')
            } else {
                const sendResult = await sendReviewsToGmb(reviewsToSend)
                logger.debug('sendReviewsToGmb result', { sendResult: sendResult as unknown })

                if (!sendResult.success) {
                    errorTracker.errorCount += 1
                    errorTracker.errorTypes.push('gmb_send_error')
                }
            }
        } catch (err) {
            errorTracker.errorCount += 1
            errorTracker.errorTypes.push('gmb_send_exception')
            logger.error('Error sending reply responses to GMB', { err })
        }
    }
    
    // Save propose responses to proposed_responses
    if (proposeResponses.length > 0) {
        try {
            const result = await prisma.proposed_responses.createMany({
                data: proposeResponses.map(response => {
                    // Find the location to get user_id and location_id
                    const location = locationsWithMatchingNotifications.find(loc => loc.id === response.locationDbId)
                    
                    // Build Google reply URL
                    // Format: https://mybusiness.googleapis.com/v4/{accountId}/{locationId}/reviews/{reviewId}/reply
                    // accountId format: "accounts/123456789"
                    // locationId format: "location/123456789"
                    // reviewId: just the ID
                    const replyUrl = `${response.review.accountId}/${response.review.locationId}/reviews/${response.review.reviewId}/reply`
                    
                    return {
                        location_id: response.locationDbId || null,
                        user_id: location?.user?.id || null,
                        reviewer_name: response.review.reviewer.displayName || 'anonymous',
                        rating: response.review.starRating === 'ONE' ? '1' : response.review.starRating === 'TWO' ? '2' : response.review.starRating === 'THREE' ? '3' : response.review.starRating === 'FOUR' ? '4' : '5',
                        comment: response.review.comment || null,
                        create_time: response.review.updateTime ? new Date(response.review.updateTime) : null,
                        response: response.response.response || null,
                        reply_url: replyUrl,
                        google_review_id: response.review.reviewId
                    }
                }),
                skipDuplicates: true
            })
            logger.debug('Saved propose responses: ' + JSON.stringify(result))
            
            // Group proposed responses by user_id to send notifications
            // This ensures we send only one message per user, even if they have multiple reviews
            const userIdToResponsesCount = new Map<string, number>()
            for (const response of proposeResponses) {
                const location = locationsWithMatchingNotifications.find(loc => loc.id === response.locationDbId)
                if (location?.user?.id) {
                    const currentCount = userIdToResponsesCount.get(location.user.id) || 0
                    userIdToResponsesCount.set(location.user.id, currentCount + 1)
                }
            }
            
            // Send WhatsApp notifications to users with new proposed responses
            if (userIdToResponsesCount.size > 0) {
                await sendWhatsAppProposedResponsesNotification(userIdToResponsesCount)
            }
        } catch (err) {
            errorTracker.errorCount += 1
            errorTracker.errorTypes.push('db_create_proposed_responses_error')
            logger.error('Error saving propose responses', { err })
        }
    }

        // delete the responses from pub/sub (only in production)
        if (process.env.NODE_ENV === 'production') {
          GmbPubSubModel.deleteNotifications(ResponsesToSend.map(response => ({
            ackId: response.ackId
          })))
        } else {
          logger.debug('Skipping deletion of ' + ResponsesToSend.length + ' processed responses (not in production)')
        }
    logger.debug('Processed ' + ResponsesToSend.length + ' notifications')

    // Compute askedCount among processed reviews (action propose)
    askedCount = proposeResponses.length

    // Increment per-location reviews_processed counters for active locations
    try {
        if (ResponsesToSend.length > 0) {
            const processedByLocation = new Map<string, number>()
            for (const r of ResponsesToSend) {
                processedByLocation.set(r.locationDbId, (processedByLocation.get(r.locationDbId) || 0) + 1)
            }
            await LocationsModel.incrementReviewsProcessed(processedByLocation)
        }
    } catch (err) {
        errorTracker.errorCount += 1
        errorTracker.errorTypes.push('db_update_locations_error')
        logger.error('Error updating locations processed counters', { err })
    }
    
    // Create a log entry in pub_sub_log
    try {
        await prisma.pub_sub_log.create({
            data: {
                reject: rejectedNotifications,
                process: replyResponses.length,
                errors: errorTracker.errorCount,
                error_types: errorTracker.errorTypes,
                not_manage: notManagedCount,
                asked: askedCount
            }
        })
        logger.debug('Created pub_sub_log entry')
    } catch (error) {
        logger.error('Error creating pub_sub_log entry', error)
    }
}

/**
 * Subscribe a single account to Google Pub/Sub
 * @param externalAccountId - Google account ID (format: "accounts/123456789")
 * @param userId - Database user ID
 * @returns Result of subscription operation
 */
export async function subscribeSingleAccountToPubSub(externalAccountId: string, userId: string): Promise<PaginatedApiResponse<null>> {
    try {
        const isAuthorized = await isAuthenticatedUserId(userId)
        if (!isAuthorized) {
            return {
                success: false,
                error: 'Unauthorized user access',
                message: 'Unauthorized user access',
                pagination: defaultPagination
            }
        }

        logger.debug('Subscribing single account to Google Pub/Sub', { externalAccountId, userId })
        
        // Get user from database to obtain clerk_id
        const dbUser = await UsersModel.findUserById(userId)
        if (!dbUser || !dbUser.clerk_id) {
            logger.error('User not found or missing clerk_id', { userId })
            return {
                success: false,
                error: 'User not found or missing clerk_id',
                message: 'User not found or missing clerk_id',
                pagination: defaultPagination
            }
        }
        
        // Get access token using clerk_id
        const accessToken = await getGoogleAccessToken(dbUser.clerk_id)
        if (!accessToken.success || !accessToken.token) {
            logger.error('Failed to get Google access token', { userId, clerkId: dbUser.clerk_id })
            return {
                success: false,
                error: 'Failed to get Google access token',
                message: 'Failed to get Google access token',
                pagination: defaultPagination
            }
        }
        
        // Subscribe the specific account to Google pub/sub
        await GmbPubSubModel.subscribeAccountToGooglePubSub(externalAccountId, accessToken.token as string)
        logger.debug('Account subscribed successfully', { externalAccountId })
        
        // Update the specific connection in database
        await ConnectionsModel.updateManyConnectionsByExternalId([{
            external_account_id: externalAccountId,
            data: { pub_sub: true } as Partial<Omit<import('../../../app/generated/prisma').connections, 'id' | 'created_at' | 'updated_at'>>
        }])
        
        logger.debug('Single account Pub/sub subscription completed', { externalAccountId, userId })
        
        return {
            success: true,
            data: null,
            message: 'Account subscribed to Pub/Sub successfully',
            pagination: defaultPagination
        }
    } catch (error) {
        logger.error('Failed to subscribe single account to Google Pub/Sub', { externalAccountId, userId, error })
        return {
            success: false,
            error: 'Failed to subscribe account to Pub/Sub',
            message: 'An error occurred while subscribing to Pub/Sub',
            pagination: defaultPagination
        }
    }
}

/**
 * Unsubscribe a single account from Google Pub/Sub
 * @param externalAccountId - Google account ID (format: "accounts/123456789")
 * @param userId - Database user ID
 * @returns Result of unsubscription operation
 */
export async function unsubscribeSingleAccountFromPubSub(externalAccountId: string, userId: string): Promise<PaginatedApiResponse<null>> {
    try {
        const isAuthorized = await isAuthenticatedUserId(userId)
        if (!isAuthorized) {
            return {
                success: false,
                error: 'Unauthorized user access',
                message: 'Unauthorized user access',
                pagination: defaultPagination
            }
        }

        logger.debug('Unsubscribing single account from Google Pub/Sub', { externalAccountId, userId })
        
        // Get user from database to obtain clerk_id
        const dbUser = await UsersModel.findUserById(userId)
        if (!dbUser || !dbUser.clerk_id) {
            logger.error('User not found or missing clerk_id', { userId })
            return {
                success: false,
                error: 'User not found or missing clerk_id',
                message: 'User not found or missing clerk_id',
                pagination: defaultPagination
            }
        }
        
        // Get access token using clerk_id
        const accessToken = await getGoogleAccessToken(dbUser.clerk_id)
        if (!accessToken.success || !accessToken.token) {
            logger.error('Failed to get Google access token', { userId, clerkId: dbUser.clerk_id })
            return {
                success: false,
                error: 'Failed to get Google access token',
                message: 'Failed to get Google access token',
                pagination: defaultPagination
            }
        }
        
        // Unsubscribe the specific account from Google pub/sub
        await GmbPubSubModel.unsubscribeAccountFromGooglePubSub(externalAccountId, accessToken.token as string)
        logger.debug('Account unsubscribed successfully', { externalAccountId })
        
        // Update the specific connection in database
        await ConnectionsModel.updateManyConnectionsByExternalId([{
            external_account_id: externalAccountId,
            data: { pub_sub: false } as Partial<Omit<import('../../../app/generated/prisma').connections, 'id' | 'created_at' | 'updated_at'>>
        }])
        
        logger.debug('Single account Pub/sub unsubscription completed', { externalAccountId, userId })
        
        return {
            success: true,
            data: null,
            message: 'Account unsubscribed from Pub/Sub successfully',
            pagination: defaultPagination
        }
    } catch (error) {
        logger.error('Failed to unsubscribe single account from Google Pub/Sub', { externalAccountId, userId, error })
        return {
            success: false,
            error: 'Failed to unsubscribe account from Pub/Sub',
            message: 'An error occurred while unsubscribing from Pub/Sub',
            pagination: defaultPagination
        }
    }
}

/**
 * Unsubscribe all Google Pub/Sub topics tied to every Google connection owned by the user
 * Used in destructive cleanup flows to ensure external notifications stop after account removal
 */
export async function unsubscribeAllPubSubTopics(userId: string): Promise<void> {
    try {
        const isAuthorized = await isAuthenticatedUserId(userId)
        if (!isAuthorized) {
            logger.error('Unauthorized user access', { userId })
            return
        }

        logger.debug('Unsubscribing all Google Pub/Sub topics for user', { userId })

        const dbUser = await UsersModel.findUserById(userId)
        if (!dbUser) {
            logger.debug('Skip Pub/Sub unsubscription: user not found', { userId })
            return
        }

        if (!dbUser.clerk_id) {
            logger.debug('Skip Pub/Sub unsubscription: user missing Clerk ID', { userId })
            return
        }

        const accessToken = await getGoogleAccessToken(dbUser.clerk_id)
        if (!accessToken.success || !accessToken.token) {
            logger.debug('Skip Pub/Sub unsubscription: failed to obtain Google token', {
                userId,
                clerkId: dbUser.clerk_id,
                error: accessToken.error,
            })
            return
        }

        const googleConnections = await ConnectionsModel.findUserConnections(userId)
        if (!googleConnections.length) {
            logger.debug('No Google connections found for Pub/Sub unsubscription', { userId })
            return
        }

        const failedAccounts: string[] = []
        const unsubscribedAccounts: string[] = []
        for (const connection of googleConnections) {
            try {
                await GmbPubSubModel.unsubscribeAccountFromGooglePubSub(
                    connection.external_account_id,
                    accessToken.token,
                )
                unsubscribedAccounts.push(connection.external_account_id)
                logger.debug('Unsubscribed connection from Google Pub/Sub', {
                    userId,
                    externalAccountId: connection.external_account_id,
                })
            } catch (error) {
                failedAccounts.push(connection.external_account_id)
                logger.error('Failed to unsubscribe Google Pub/Sub for connection', error)
            }
        }

        if (unsubscribedAccounts.length > 0) {
            await ConnectionsModel.updateManyConnectionsByExternalId(
                unsubscribedAccounts.map((externalAccountId) => ({
                    external_account_id: externalAccountId,
                    data: {
                        pub_sub: false,
                    } as Partial<
                        Omit<
                            import('../../../app/generated/prisma').connections,
                            'id' | 'created_at' | 'updated_at'
                        >
                    >,
                })),
            )
        }

        if (failedAccounts.length) {
            throw new Error(
                `Unable to unsubscribe Google Pub/Sub for accounts: ${failedAccounts.join(', ')}`,
            )
        }

        logger.debug('Unsubscribed all Google Pub/Sub topics for user', {
            userId,
            totalConnections: googleConnections.length,
        })
    } catch (error) {
        logger.error('Unexpected error during Google Pub/Sub unsubscription', error)
        throw error
    }
}

/**
 * Refresh single account: sync locations and check/update Pub/Sub status
 * @param externalAccountId - Google account ID (format: "accounts/123456789")
 * @param userId - Database user ID
 * @returns Result of refresh operation
 */
export async function refreshSingleAccount(externalAccountId: string, userId: string): Promise<PaginatedApiResponse<{
    externalAccountId: string
    locationsUpdated: number
    locationsCreated: number
    pubSubStatusUpdated: boolean
    finalPubSubStatus: boolean
}>> {
    try {
        const isAuthorized = await isAuthenticatedUserId(userId)
        if (!isAuthorized) {
            return {
                success: false,
                error: 'Unauthorized user access',
                message: 'Unauthorized user access',
                pagination: defaultPagination
            }
        }

        logger.debug('Refreshing single account', { externalAccountId, userId })
        
        // Get user from database to obtain clerk_id
        const dbUser = await UsersModel.findUserById(userId)
        if (!dbUser || !dbUser.clerk_id) {
            logger.error('User not found or missing clerk_id', { userId })
            return {
                success: false,
                error: 'User not found or missing clerk_id',
                message: 'User not found or missing clerk_id',
                pagination: defaultPagination
            }
        }
        
        // Get access token using clerk_id
        const accessToken = await getGoogleAccessToken(dbUser.clerk_id)
        if (!accessToken.success || !accessToken.token) {
            logger.error('Failed to get Google access token', { userId, clerkId: dbUser.clerk_id })
            return {
                success: false,
                error: 'Failed to get Google access token',
                message: 'Failed to get Google access token',
                pagination: defaultPagination
            }
        }
        
        // Get connection from database
        const connections = await ConnectionsModel.findConnectionsByExternalIds([externalAccountId])
        const connection = connections[0]
        if (!connection) {
            logger.error('Connection not found', { externalAccountId })
            return {
                success: false,
                error: 'Connection not found',
                message: 'Connection not found',
                pagination: defaultPagination
            }
        }
        
        // Step 1: Sync locations for this specific account
        logger.debug('Syncing locations for account', { externalAccountId })
        const { GmbLocationsModel } = await import('@/server/models/gmb/locations.model')
        const locations = await GmbLocationsModel.fetchLocationsForConnection(
            { id: connection.id, external_account_id: connection.external_account_id },
            accessToken.token as string
        )
        
        // Update/create locations using existing upsert logic
        const { syncGoogleLocationsToLocations } = await import('@/server/actions/gmb/locations.action')
        const syncResult = await syncGoogleLocationsToLocations({
            locations: locations,
            dbUser
        })
        
        logger.debug('Locations synced', { 
            externalAccountId, 
            updated: syncResult.savedLocations.length,
            totalProcessed: syncResult.totalProcessed 
        })
        
        // Step 2: Check Pub/Sub status from Google
        logger.debug('Checking Pub/Sub status from Google', { externalAccountId })
        const googleStatus = await GmbPubSubModel.checkAccountPubSubStatus(externalAccountId, accessToken.token as string)
        
        // Determine if account is actually subscribed (has topic AND notification types)
        const rawResponse = googleStatus.rawResponse as { notificationTypes?: string[] }
        const isActuallySubscribed = Boolean(googleStatus.pubsubTopic && rawResponse?.notificationTypes && rawResponse.notificationTypes.length > 0)
        
        logger.debug('Google Pub/Sub status', { 
            externalAccountId, 
            hasTopic: Boolean(googleStatus.pubsubTopic),
            hasNotificationTypes: Boolean(rawResponse?.notificationTypes && rawResponse.notificationTypes.length > 0),
            isActuallySubscribed 
        })
        
        // Step 3: Update database if status differs
        let pubSubStatusUpdated = false
        if (connection.pub_sub !== isActuallySubscribed) {
            await ConnectionsModel.updateManyConnectionsByExternalId([{
                external_account_id: externalAccountId,
                data: { pub_sub: isActuallySubscribed } as Partial<Omit<import('../../../app/generated/prisma').connections, 'id' | 'created_at' | 'updated_at'>>
            }])
            pubSubStatusUpdated = true
            logger.debug('Updated Pub/Sub status in database', { 
                externalAccountId, 
                oldStatus: connection.pub_sub, 
                newStatus: isActuallySubscribed 
            })
        }
        
        logger.debug('Single account refresh completed', { 
            externalAccountId, 
            userId,
            locationsUpdated: syncResult.savedLocations.length,
            pubSubStatusUpdated,
            finalPubSubStatus: isActuallySubscribed
        })
        
        return {
            success: true,
            data: {
                externalAccountId,
                locationsUpdated: syncResult.savedLocations.length,
                locationsCreated: syncResult.savedLocations.length, // upsert handles both create/update
                pubSubStatusUpdated,
                finalPubSubStatus: isActuallySubscribed
            },
            message: `Account refreshed successfully. Locations: ${syncResult.savedLocations.length}, Pub/Sub: ${isActuallySubscribed ? 'Active' : 'Inactive'}`,
            pagination: defaultPagination
        }
    } catch (error) {
        logger.error('Failed to refresh single account', { externalAccountId, userId, error })
        return {
            success: false,
            error: 'Failed to refresh account',
            message: 'An error occurred while refreshing account',
            pagination: defaultPagination
        }
    }
}

/**
 * Check Pub/Sub subscription status for a single account
 * @param externalAccountId - Google account ID (format: "accounts/123456789")
 * @param userId - Database user ID
 * @returns Status comparison between Google API and database
 */
export async function checkSingleAccountPubSubStatus(externalAccountId: string, userId: string): Promise<PaginatedApiResponse<{
    externalAccountId: string
    dbStatus: boolean
    googleStatus: boolean
    statusMatch: boolean
    pubsubTopic?: string | null
}>> {
    try {
        const isAuthorized = await isAuthenticatedUserId(userId)
        if (!isAuthorized) {
            return {
                success: false,
                error: 'Unauthorized user access',
                message: 'Unauthorized user access',
                pagination: defaultPagination
            }
        }

        logger.debug('Checking single account Pub/Sub status', { externalAccountId, userId })
        
        // Get user from database to obtain clerk_id
        const dbUser = await UsersModel.findUserById(userId)
        if (!dbUser || !dbUser.clerk_id) {
            logger.error('User not found or missing clerk_id', { userId })
            return {
                success: false,
                error: 'User not found or missing clerk_id',
                message: 'User not found or missing clerk_id',
                pagination: defaultPagination
            }
        }
        
        // Get access token using clerk_id
        const accessToken = await getGoogleAccessToken(dbUser.clerk_id)
        if (!accessToken.success || !accessToken.token) {
            logger.error('Failed to get Google access token', { userId, clerkId: dbUser.clerk_id })
            return {
                success: false,
                error: 'Failed to get Google access token',
                message: 'Failed to get Google access token',
                pagination: defaultPagination
            }
        }
        
        // Get connection from database to check current status
        const connections = await ConnectionsModel.findConnectionsByExternalIds([externalAccountId])
        const connection = connections[0]
        if (!connection) {
            logger.error('Connection not found', { externalAccountId })
            return {
                success: false,
                error: 'Connection not found',
                message: 'Connection not found',
                pagination: defaultPagination
            }
        }
        
        // Check status with Google API
        const googleStatus = await GmbPubSubModel.checkAccountPubSubStatus(externalAccountId, accessToken.token as string)
        
        const result = {
            externalAccountId,
            dbStatus: Boolean(connection.pub_sub),
            googleStatus: googleStatus.isSubscribed,
            statusMatch: Boolean(connection.pub_sub) === googleStatus.isSubscribed,
            pubsubTopic: googleStatus.pubsubTopic
        }
        
        logger.debug('Single account Pub/sub status check completed', { externalAccountId, userId, result })
        
        return {
            success: true,
            data: result,
            message: `Status check completed for account ${externalAccountId}`,
            pagination: defaultPagination
        }
    } catch (error) {
        logger.error('Failed to check single account Pub/Sub status', { externalAccountId, userId, error })
        return {
            success: false,
            error: 'Failed to check account Pub/Sub status',
            message: 'An error occurred while checking Pub/Sub status',
            pagination: defaultPagination
        }
    }
}

const defaultPagination = {
    page: 1,
    limit: 1,
    total: 1,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
}

