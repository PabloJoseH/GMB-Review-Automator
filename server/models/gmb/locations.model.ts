/**
 * GMB Locations Model - Google My Business Locations API Operations
 * 
 * This model handles all operations related to Google My Business API
 * for retrieving location information. Includes functions to fetch location data
 * using Google's Business Information API v1.
 * 
 * Main functionalities:
 * - Fetch Google My Business locations by connection
 * - Extract only necessary location data (address, coordinates, category, phone, website)
 * - Extract opening hours data for opening_hours table
 * - Optimized readMask to request only required fields from Google API
 * - Handle API responses with specific field mapping
 * - Validate and transform location data
 */

import { createLogger } from '@/lib/logger'

const logger = createLogger('GMB-LOCATIONS')

export interface GoogleBusinessLocation {
  name: string
  title?: string
  websiteUri?: string
  labels?: string[]
  storeCode?: string
  phoneNumbers?: {
    primaryPhone?: string
    additionalPhones?: string[]
  }
  storefrontAddress?: {
    regionCode?: string
    locality?: string
    administrativeArea?: string
    postalCode?: string
    addressLines?: string[]
  }
  serviceArea?: {
    businessType?: string
    regionCode?: string
    [key: string]: unknown
  }
  categories?: {
    primaryCategory?: {
      name?: string
      displayName?: string
    }
    additionalCategories?: Array<{
      name?: string
      displayName?: string
    }>
  }
  latlng?: {
    latitude?: number
    longitude?: number
  }
  metadata?: {
    [key: string]: unknown
  }
  regularHours?: {
    periods?: Array<{
      openDay?: string
      closeDay?: string
      openTime?: {
        hours?: number
        minutes?: number
        seconds?: number
        nanos?: number
      }
      closeTime?: {
        hours?: number
        minutes?: number
        seconds?: number
        nanos?: number
      }
    }>
  }
  specialHours?: {
    [key: string]: unknown
  }
  moreHours?: {
    [key: string]: unknown
  }
  openInfo?: {
    [key: string]: unknown
  }
  profile?: {
    description?: string
  }
  relationshipData?: {
    [key: string]: unknown
  }
  adWordsLocationExtensions?: {
    [key: string]: unknown
  }
}

export interface GoogleBusinessLocationWithConnection extends GoogleBusinessLocation {
  connectionId?: string
}

export const GmbLocationsModel = {
  // only request data needed for locations and opening_hours tables
  readMaskFields: [
    'name',                    // For google_location_id
    'title',                   // For name
    'websiteUri',              // For website
    'phoneNumbers.primaryPhone', // For phone
    'storefrontAddress.addressLines', // For address_line1 and address_line2
    'storefrontAddress.locality',     // For city
    'storefrontAddress.postalCode',   // For postal_code
    'storefrontAddress.administrativeArea', // For region
    'storefrontAddress.regionCode',    // For country
    'categories.primaryCategory', // For primary_category (includes name and displayName)
    'latlng.latitude',         // For lat
    'latlng.longitude',        // For lng
    'regularHours.periods'    // For opening_hours (openDay, openTime, closeTime)
  ] as const,

  /**
   * Fetches every location for a specific connection using the Business Information API v1.
   * @param connection - Connection identifier containing both the DB id and `external_account_id`
   * @param accessToken - Google access token
   * @param maxLocations - Upper bound of locations to return (defaults to 100)
   * @returns Array of Google My Business locations enriched with the connection id
   */
  fetchLocationsForConnection: async (
    connection: { id: string; external_account_id: string }, 
    accessToken: string,
    maxLocations = 100
  ): Promise<GoogleBusinessLocationWithConnection[]> => {
    const startTime = Date.now()
    
    try {
      logger.info('Fetching locations for connection', { 
        connectionId: connection.id,
        externalAccountId: connection.external_account_id 
      })
      
      const aggregated: GoogleBusinessLocationWithConnection[] = []
      let nextPageToken: string | undefined = undefined
      let pageNumber = 0

      do {
        pageNumber++
        
        // Build the search parameters for the request
        const readMask = GmbLocationsModel.readMaskFields.join(',')
        const searchParams = new URLSearchParams({
          readMask: readMask,
          pageSize: '100' // Maximum page size allowed by the API
        })
        if (nextPageToken) searchParams.set('pageToken', nextPageToken)

        const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${connection.external_account_id}/locations?${searchParams.toString()}`
        
        const requestStartTime = Date.now()
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          signal: AbortSignal.timeout(30000)
        })
        const requestDuration = Date.now() - requestStartTime

        if (!response.ok) {
          const errorText = await response.text()
          let errorDetails: Record<string, unknown> = {}
          
          try {
            const errorJson = JSON.parse(errorText)
            errorDetails = {
              errorCode: errorJson.error?.code,
              errorMessage: errorJson.error?.message,
              errorStatus: errorJson.error?.status,
              fullError: errorJson
            }
          } catch {
            errorDetails = { rawError: errorText }
          }

          logger.error('Google Business Information API request failed', new Error(`HTTP ${response.status}`), {
            connectionId: connection.id,
            externalAccountId: connection.external_account_id,
            httpStatus: response.status,
            httpStatusText: response.statusText,
            requestUrl: url,
            requestDuration: `${requestDuration}ms`,
            pageNumber,
            responseHeaders: Object.fromEntries(response.headers.entries()),
            errorDetails
          })
          
          throw new Error(`Google Business Information API Error: ${response.status}`)
        }

        const data = await response.json()
        
        const pageLocations = data.locations || []
        
        // Append connectionId to every location returned in this page
        const locationsWithConnection: GoogleBusinessLocationWithConnection[] = pageLocations.map((location: GoogleBusinessLocation) => ({
          ...location,
          connectionId: connection.id
        }))
        
        aggregated.push(...locationsWithConnection)
        nextPageToken = data.nextPageToken

        logger.info('Location page fetched successfully', {
          connectionId: connection.id,
          externalAccountId: connection.external_account_id,
          pageNumber,
          pageCount: pageLocations.length,
          aggregatedSoFar: aggregated.length,
          hasNextPage: !!nextPageToken,
          requestDuration: `${requestDuration}ms`
        })

        if (aggregated.length >= maxLocations) {
          break
        }
      } while (nextPageToken)
      
      const totalDuration = Date.now() - startTime
      logger.info('Locations fetched successfully for connection', { 
        connectionId: connection.id,
        externalAccountId: connection.external_account_id,
        totalCount: aggregated.length,
        totalDuration: `${totalDuration}ms`,
        pagesFetched: pageNumber
      })
      
      return aggregated.slice(0, maxLocations)
    } catch (error) {
      const totalDuration = Date.now() - startTime
      
      logger.error('Failed to fetch locations for connection', error instanceof Error ? error : new Error(String(error)), {
        connectionId: connection.id,
        externalAccountId: connection.external_account_id,
        totalDuration: `${totalDuration}ms`,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      })
      
      throw error
    }
  },

  /**
   * Retrieves a single location by its resource name via the Business Information API v1.
   * @param locationName - Unique Google resource name (`accounts/{accountId}/locations/{id}`)
   * @param accessToken - Google access token
   * @returns Location payload or null when it does not exist
   */
  fetchLocationByName: async (
    locationName: string, 
    accessToken: string
  ): Promise<GoogleBusinessLocation | null> => {
    try {
      logger.debug('Fetching specific location', { locationName })
      
      // Build the API URL including the readMask
      const readMask = GmbLocationsModel.readMaskFields.join(',')
      const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}?readMask=${readMask}`
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 404) {
          logger.debug('Location not found', { locationName })
          return null
        }
        const errorText = await response.text()
        logger.error('Google Business Information API request failed', new Error(`HTTP ${response.status}: ${errorText}`))
        throw new Error(`Google Business Information API Error: ${response.status}`)
      }

      const location = await response.json()
      logger.debug('Location fetched successfully', { locationName })
      
      return location
    } catch (error) {
      logger.error('Failed to fetch location', error instanceof Error ? error : new Error(String(error)), { locationName })
      throw error
    }
  }
}
