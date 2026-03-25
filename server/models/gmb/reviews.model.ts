/**
 * GMB Reviews Model - Google My Business Reviews API Operations
 *
 * Overview:
 * - Fetch review pages through Google My Business API v4
 * - Handle pagination and aggregation with rate/size safeguards
 * - Normalize review payloads for downstream persistence
 * - Retrieve single reviews for follow-up workflows
 *
 * Exported entities:
 * - `GmbReviewsModel`: helper with fetching utilities
 * - `GoogleMyBusinessReview`, `GoogleMyBusinessReviewsResponse`: DTO typings
 */

import { createLogger } from '@/lib/logger'
import { APP_CONSTANTS } from '@/lib/constants'

const logger = createLogger('GmbReviewsModel')

export interface GoogleMyBusinessReview {
  name: string
  reviewId: string
  reviewer: {
    displayName?: string
    profilePhotoUrl?: string
    isAnonymous?: boolean
  }
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE'
  comment?: string
  createTime: string
  updateTime?: string
  reviewReply?: {
    comment?: string
    updateTime?: string
  }
  reviewState?: 'PUBLISHED' | 'DRAFT' | 'DELETED'
}

export interface GoogleMyBusinessReviewsResponse {
  reviews?: GoogleMyBusinessReview[]
  averageRating?: number
  totalReviewCount?: number
  nextPageToken?: string
}

export const GmbReviewsModel = {
  /**
   * Retrieves every available review for a location using the Google My Business API v4.
   * @param params - Configuration for the paginated request
   * @returns Array of Google My Business reviews
   */
  fetchAllReviewsForLocation: async (params: {
    baseUrl: string
    accessToken: string
    maxPerLocation?: number
  }): Promise<GoogleMyBusinessReview[]> => {
    const { baseUrl, accessToken, maxPerLocation = APP_CONSTANTS.gmb.defaultMaxPerLocation } = params
    const aggregated: GoogleMyBusinessReview[] = []
    let nextPageToken: string | undefined = undefined

    do {
      const searchParams = new URLSearchParams({
        pageSize: APP_CONSTANTS.gmb.pageSize.toString(),
        orderBy: 'updateTime desc'
      })
      if (nextPageToken) searchParams.set('pageToken', nextPageToken)

      const fullUrl = `${baseUrl}?${searchParams.toString()}`

      const response = await fetch(fullUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(APP_CONSTANTS.gmb.fetchTimeout)
      })

      if (!response.ok) {
        const errorText = await response.text()
      logger.error('Google Reviews API pagination error', new Error(`${response.status}: ${errorText}`))
        throw new Error(`Google Reviews API Error ${response.status}: ${errorText}`)
      }

      const json: GoogleMyBusinessReviewsResponse = await response.json()

      const pageReviews = json.reviews || []
      aggregated.push(...pageReviews)
      nextPageToken = json.nextPageToken

      logger.debug('Review page fetched', {
        pageCount: pageReviews.length,
        aggregatedSoFar: aggregated.length,
        hasNextPage: !!nextPageToken
      })

      if (aggregated.length >= maxPerLocation) {
        break
      }
    } while (nextPageToken)

    return aggregated.slice(0, maxPerLocation)
  },

  /**
   * Processes reviews for a specific location.
   * @param location - Location metadata required to call Google
   * @param accessToken - Google access token
   * @returns Array of Google My Business reviews
   */
  processLocationReviews: async (
    location: { 
      id: string
      name?: string | null
      google_location_id?: string | null
      connections?: { id: string; external_account_id: string } | null
    }, 
    accessToken: string,
    maxPerLocation?: number
  ): Promise<GoogleMyBusinessReview[]> => {
    try {
      if (!location.google_location_id || !location.connections?.external_account_id) {
        logger.debug('Missing required data for location:', { locationId: location.id })
        return []
      }

      // Build the base URL for the reviews API call
      let reviewsUrl: string
    
    if (location.google_location_id?.startsWith('accounts/')) {
      // If it already has the complete format, use it directly
      reviewsUrl = `https://mybusiness.googleapis.com/v4/${location.google_location_id}/reviews`
    } else {
      // If we only have the locationId, we need to build the URL with the connection's accountId
      const connection = location.connections
      if (!connection) {
        logger.error('Connection not found for location', new Error('No connection found'))
        return []
      }
      
      reviewsUrl = `https://mybusiness.googleapis.com/v4/${connection.external_account_id}/${location.google_location_id}/reviews`
    }
      
      logger.debug('Processing reviews for location:', {
        locationId: location.id,
        locationName: location.name,
        googleLocationId: location.google_location_id,
        accountId: location.connections.external_account_id,
        reviewsUrl: reviewsUrl
      })

      return await GmbReviewsModel.fetchAllReviewsForLocation({
        baseUrl: reviewsUrl,
        accessToken,
        maxPerLocation: maxPerLocation || APP_CONSTANTS.gmb.defaultMaxPerLocation
      })
      
    } catch (error) {
      logger.error('Error processing reviews for location:', error, { locationId: location.id })
      throw error
    }
  },

  /**
   * Fetches a single review by its identifier.
   * @param reviewId - Unique review identifier
   * @param accountId - Google My Business account id
   * @param locationId - Location id (with or without the `locations/` prefix)
   * @param accessToken - Google access token
   * @returns Review payload or null when it does not exist
   */
  fetchReviewById: async (
    reviewId: string,
    accountId: string,
    locationId: string,
    accessToken: string
  ): Promise<GoogleMyBusinessReview | null> => {
    try {
      // Remove the leading `locations/` prefix if present
      const cleanLocationId = locationId.replace(/^locations\//, '')
      
      // Use the v4 API endpoint that still supports review retrieval
      const url = `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${cleanLocationId}/reviews/${reviewId}`
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Google My Business API request failed', { 
          status: response.status, 
          errorText,
          url 
        })
        
        if (response.status === 404) {
          logger.debug('Review not found:', { reviewId })
          return null
        }
        
        throw new Error(`Google My Business API Error: ${response.status} - ${errorText}`)
      }

      const review = await response.json()
      
      return review
    } catch (error) {
      logger.error('Failed to fetch review:', error, { reviewId })
      throw error
    }
  }
}
