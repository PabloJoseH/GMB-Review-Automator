/**
 * GMB Pub/Sub Model - Google My Business Pub/Sub API Operations
 * 
 * This model handles all the operations related to the Google My Business Pub/Sub API.
 * It includes functions to get reviews and delete reviews.
 * 
 * Main functionalities:
 * - Get reviews from Google My Business using Service Account
 * - Delete reviews from Google My Business using Service Account
 * - Automatic authentication with service account credentials
 * 
 * Configuration (in priority order):
 * Option 1 - Individual environment variables (recommended for production):
 *   - GOOGLE_SERVICE_ACCOUNT_PROJECT_ID: GCP project ID
 *   - GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: Service account private key
 *   - GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL: Service account email
 * 
 * Option 2 - Inline JSON credentials:
 *   - GOOGLE_SERVICE_ACCOUNT_JSON: Full service account JSON as string
 * 
 * Option 3 - File path:
 *   - GOOGLE_SERVICE_ACCOUNT_KEY: Path to service account JSON file (e.g., './credentials/service-account.json')
 *   OR
 *   - GOOGLE_APPLICATION_CREDENTIALS: Standard GCP environment variable for service account path
 * 
 * Option 4 - Default credentials (when running on GCP)
 */

import { v1 } from '@google-cloud/pubsub'
import type { google } from '@google-cloud/pubsub/build/protos/protos'
import { createLogger } from '@/lib/logger'

const logger = createLogger('GmbPubSubModel')

// Initialize Subscriber client with Service Account
// The Google Cloud client libraries automatically use credentials from:
// 1. Individual environment variables (GOOGLE_SERVICE_ACCOUNT_PROJECT_ID, etc.)
// 2. GOOGLE_APPLICATION_CREDENTIALS environment variable (path to JSON file)
// 3. GOOGLE_SERVICE_ACCOUNT_KEY environment variable (path to JSON file) - custom variable
// 4. GOOGLE_SERVICE_ACCOUNT_JSON environment variable (JSON string) - custom variable
// 5. Default service account if running on GCP
let subscriberClient: v1.SubscriberClient

try {
  const serviceAccountKeyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  
  // Individual environment variables for service account credentials
  const projectId = process.env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL

  // Priority 1: Use individual environment variables if all required fields are present
  if (projectId && privateKey && clientEmail) {
    const credentials = {
      type: 'service_account',
      project_id: projectId,
      private_key: privateKey.replace(/\\n/g, '\n'), // Replace escaped newlines
      client_email: clientEmail,
    }
    subscriberClient = new v1.SubscriberClient({
      credentials: credentials
    })
    logger.info('Pub/Sub SubscriberClient initialized with individual environment variables')
  }
  // Priority 2: Use inline JSON credentials
  else if (serviceAccountJson) {
    const credentials = JSON.parse(serviceAccountJson)
    subscriberClient = new v1.SubscriberClient({
      credentials: credentials
    })
    logger.info('Pub/Sub SubscriberClient initialized with inline service account credentials')
  } 
  // Priority 3: Use credentials from file path
  else if (serviceAccountKeyPath) {
    subscriberClient = new v1.SubscriberClient({
      keyFilename: serviceAccountKeyPath
    })
    logger.info('Pub/Sub SubscriberClient initialized with service account from file', { 
      keyFile: serviceAccountKeyPath 
    })
  } 
  // Priority 4: Use default credentials (useful when running on GCP)
  else {
    subscriberClient = new v1.SubscriberClient()
    logger.info('Pub/Sub SubscriberClient initialized with default credentials')
  }
} catch (error) {
  logger.error('Failed to initialize Pub/Sub SubscriberClient', { error })
  throw new Error('Failed to initialize Pub/Sub client. Please check your service account configuration.')
}

const PROJECT_ID = process.env.GOOGLE_PUBSUB_PROJECT_ID || 'fractal-datalakes'
const SUBSCRIPTION_NAME = `${process.env.GOOGLE_PUBSUB_TOPIC_NAME}-sub`
const SUBSCRIPTION_PATH = subscriberClient.subscriptionPath(PROJECT_ID, SUBSCRIPTION_NAME)

/** 
 * receivedMessages[]
 * 
 * Response structure from Pub/Sub API:
 * {
 *   "receivedMessages": [
 *     {
 *       "ackId": "string",
 *       "message": {
 *         "data": "string",  // base64 encoded JSON string
 *         "messageId": "string",
 *         "publishTime": "string"
 *       }
 *     }
 *   ]
 * }
 * 
 * Decoded data contains:
 * - type: string (e.g., "NEW_REVIEW")
 * - location: string (e.g., "accounts/106969066724077024942/locations/3559285078058379484")
 * - review: string (e.g., "accounts/106969066724077024942/locations/3559285078058379484/reviews/...")
 */ 

// Raw format that comes from Google Pub/Sub
export interface PubSubMessageDataRaw {
  type: string
  location: string
  review: string
}

// Parsed format with extracted IDs
export interface PubSubMessageData {
  type: string
  location: string
  review: string
  locationId: string  // Extracted from location path with "location/" prefix, e.g., "location/123123141232"
  reviewId: string    // Extracted from review path
  accountId: string   // Extracted from location path
}

/**
 * Extract accountId, locationId, and reviewId from the paths
 * @param data Raw Pub/Sub message data
 * @returns Parsed data with extracted IDs
 */
function parsePubSubData(data: PubSubMessageDataRaw): PubSubMessageData {
  // Extract accountId and locationId from location path
  // Format: "accounts/{accountId}/locations/{locationId}"
  const locationMatch = data.location.match(/accounts\/([^/]+)\/(locations\/[^/]+)/)
  const accountId = locationMatch?.[1] || ''
  const locationId = locationMatch?.[2] || '' // Includes "location/" prefix, e.g., "location/123123141232"
  
  // Extract reviewId from review path
  // Format: "accounts/{accountId}/locations/{locationId}/reviews/{reviewId}"
  const reviewMatch = data.review.match(/reviews\/([^/]+)$/)
  const reviewId = reviewMatch?.[1] || ''
  
  return {
    type: data.type,
    location: data.location,
    review: data.review,
    accountId,
    locationId,
    reviewId
  }
}

export interface GoogleMyBusinessPubSubMessage {
  ackId: string
  message: {
    data: string // base64 encoded
    messageId: string
    publishTime: string
  }
}

export interface GoogleMyBusinessPubSubResponse {
  receivedMessages?: GoogleMyBusinessPubSubMessage[]
}

export interface DecodedPubSubMessage {
  ackId: string
  message: {
    data: PubSubMessageData // decoded and parsed
    messageId: string
    publishTime: string
  }
}

export const GmbPubSubModel = {
  /**
   * Get notifications from Google My Business Pub/Sub (Service Account)
   * @returns Array of decoded Pub/Sub messages with review information
   */
  getNotifications: async (): Promise<DecodedPubSubMessage[]> => {
    try {
      // Service Account credentials are automatically handled by the client library
      
      // Pull messages from the subscription
      // maxMessages: maximum number of messages to pull at once
      const maxMessages = 1000
      const request = {
        subscription: SUBSCRIPTION_PATH,
        maxMessages: maxMessages,
      }
      
      // Set timeout to 10 seconds
      const timeout = 10000 // 10 seconds in milliseconds
      const [response] = await subscriberClient.pull(request, { timeout })
      
      // if no messages received, return empty array
      if (!response || !response.receivedMessages || response.receivedMessages.length === 0) {
        logger.info('No messages received from Pub/Sub')
        return []
      }

      // decode base64 data and parse JSON
      // data contains: reviewPath, locationPath, accountId, locationId, reviewId, eventType
      const decodedMessages: DecodedPubSubMessage[] = response.receivedMessages.map((receivedMessage: google.pubsub.v1.IReceivedMessage) => {
        try {
          // Validate required fields
          if (!receivedMessage.ackId || !receivedMessage.message) {
            throw new Error('Invalid message: missing ackId or message')
          }
          
          // The data is base64 encoded in the message
          const messageData = receivedMessage.message.data
          if (!messageData) {
            throw new Error('Invalid message: missing data')
          }
          
          // Convert Uint8Array or string to Buffer for decoding
          const dataBuffer = typeof messageData === 'string' 
            ? Buffer.from(messageData, 'base64')
            : Buffer.from(messageData)
            
          const decodedString = dataBuffer.toString('utf-8')
          // parse JSON string to object
          const rawData: PubSubMessageDataRaw = JSON.parse(decodedString)
          // Parse and extract IDs from paths
          const parsedData: PubSubMessageData = parsePubSubData(rawData)
          
          // Get publishTime as ISO string
          let publishTimeStr: string
          if (receivedMessage.message.publishTime) {
            const timestamp = receivedMessage.message.publishTime
            if (typeof timestamp === 'object' && 'seconds' in timestamp) {
              const seconds = Number(timestamp.seconds) || 0
              publishTimeStr = new Date(seconds * 1000).toISOString()
            } else {
              publishTimeStr = new Date().toISOString()
            }
          } else {
            publishTimeStr = new Date().toISOString()
          }
          
          return {
            ackId: receivedMessage.ackId,
            message: {
              data: parsedData,
              messageId: receivedMessage.message.messageId || 'unknown',
              publishTime: publishTimeStr
            }
          }
        } catch (error) {
          logger.error('Error decoding message data', { 
            messageId: receivedMessage.message?.messageId,
            error 
          })
          throw new Error(`Failed to decode message: ${receivedMessage.message?.messageId}`)
        }
      })
      
      logger.info(`Successfully decoded ${decodedMessages.length} messages from Pub/Sub`)
      
      // return the decoded notifications
      return decodedMessages
    } catch (error) {
      // Check if it's a timeout error - return empty array instead of throwing
      if (error instanceof Error && (
        error.message.includes('DEADLINE_EXCEEDED') || 
        error.message.includes('deadline') ||
        error.message.includes('timeout')
      )) {
        logger.debug('Pub/Sub pull timeout - no messages available')
        return []
      }
      
      logger.error('Error getting notifications from Google Pub/Sub', { error })
      
      // Check if it's an authentication error
      if (error instanceof Error && (error.message.includes('401') || error.message.includes('unauthorized'))) {
        logger.error('Authentication failed. Service account credentials may be invalid or lack permissions.')
        logger.error('Please verify your service account configuration: GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_SERVICE_ACCOUNT_JSON')
      }
      
      throw new Error('Error getting notifications from Google Pub/Sub')
    }
  },

  /**
   * Delete notifications in Google My Business Pub/Sub (Service Account)
   * @param notifications - Array of notifications to delete
   * @returns void
   */
  deleteNotifications: async (notifications: { ackId: string }[]): Promise<void> => {
    try {
      // Acknowledge messages using their ackIds
      const ackIds = notifications.map(notification => notification.ackId)
      
      if (ackIds.length > 0) {
        const request = {
          subscription: SUBSCRIPTION_PATH,
          ackIds: ackIds,
        }
        
        await subscriberClient.acknowledge(request)
        logger.info(`Successfully acknowledged ${ackIds.length} messages`)
      }
    } catch (error) {
      logger.error('Error acknowledging messages in Google Pub/Sub', { error })
      
      // Check if it's an authentication error
      if (error instanceof Error && (error.message.includes('401') || error.message.includes('unauthorized'))) {
        logger.error('Authentication failed. Service account credentials may be invalid or lack permissions.')
        logger.error('Please verify your service account configuration: GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_SERVICE_ACCOUNT_JSON')
      }
      
      throw new Error('Error acknowledging messages in Google Pub/Sub')
    }
  },

  /**
   * Subscribe account to Google Pub/Sub
   * @param accountId - Google account ID (format: "accounts/123456789")
   * @param accessToken - Google access token
   * @returns Subscription result
   */
  subscribeAccountToGooglePubSub: async (accountId: string, accessToken: string) => {
    try {
      logger.debug('Subscribing account to Google pub/sub', { accountId, topicName: process.env.GOOGLE_PUBSUB_TOPIC_NAME })

      const pubsubTopic = `projects/${process.env.GOOGLE_PUBSUB_PROJECT_ID}/topics/${process.env.GOOGLE_PUBSUB_TOPIC_NAME}`
      const url = `https://mybusinessnotifications.googleapis.com/v1/${accountId}/notificationSetting?updateMask=pubsubTopic,notificationTypes`

      const body = {
        name: `${accountId}/notificationSetting`,
        pubsubTopic,
        notificationTypes: ['NEW_REVIEW', 'UPDATED_REVIEW']
      }

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })

      const text = await response.text()
      if (!response.ok) {
        throw new Error(`Google API error ${response.status} ${response.statusText}: ${text}`)
      }

      let json: unknown
      try { json = JSON.parse(text) } catch { json = text }
      logger.debug('Subscribed OK', { response: json })
      return json
    } catch (error) {
      logger.error('Failed to subscribe account to Google pub/sub', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  },

  /**
   * Unsubscribe account from Google Pub/Sub
   * @param accountId - Google account ID (format: "accounts/123456789")
   * @param accessToken - Google access token
   * @returns Unsubscription result
   */
  unsubscribeAccountFromGooglePubSub: async (accountId: string, accessToken: string) => {
    try {
      logger.debug('Unsubscribing account from Google pub/sub', { accountId, topicName: process.env.GOOGLE_PUBSUB_TOPIC_NAME })
      
      const pubsubTopic = `projects/${process.env.GOOGLE_PUBSUB_PROJECT_ID}/topics/${process.env.GOOGLE_PUBSUB_TOPIC_NAME}`
      const url = `https://mybusinessnotifications.googleapis.com/v1/${accountId}/notificationSetting?updateMask=pubsubTopic,notificationTypes`
      
      // We mantain the pubsubTopic but we clear the notificationTypes
      const body = {
       name: `${accountId}/notificationSetting`,
       pubsubTopic,   
       notificationTypes: []
      }

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })

      const text = await response.text()
      if (!response.ok) {
        throw new Error(`Google API error ${response.status} ${response.statusText}: ${text}`)
      }

      let json: unknown
      try { json = JSON.parse(text) } catch { json = text }
      logger.debug('Unsubscribed OK', { response: json })
      return json
    } catch (error) {
      logger.error('Failed to unsubscribe account from Google pub/sub', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  },

  /**
   * Check account Pub/Sub subscription status 
   * @param accountId - Google account ID (format: "accounts/123456789")
   * @param accessToken - Google access token
   * @returns Subscription status information
   */
  checkAccountPubSubStatus: async (accountId: string, accessToken: string) => {
    try {
      logger.debug('Checking account pub/sub status', { accountId })

      const url = `https://mybusinessnotifications.googleapis.com/v1/${accountId}/notificationSetting`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      const text = await response.text()
      if (!response.ok) {
        throw new Error(`Google API error ${response.status} ${response.statusText}: ${text}`)
      }

      let json: unknown
      try { json = JSON.parse(text) } catch { json = text }
      
      // Extract subscription status
      const notificationSetting = json as { 
        pubsubTopic?: string | null
        notificationTypes?: string[]
      }
      
      // Account is subscribed only if it has both topic AND notification types with items
      // When "unsubscribed", the topic remains but notificationTypes is empty
      const isSubscribed = Boolean(
        notificationSetting?.pubsubTopic && 
        notificationSetting?.notificationTypes && 
        notificationSetting.notificationTypes.length > 0
      )
      
      logger.debug('Pub/sub status checked', { 
        accountId, 
        isSubscribed,
        hasTopic: Boolean(notificationSetting?.pubsubTopic),
        notificationTypesCount: notificationSetting?.notificationTypes?.length || 0
      })
      return {
        isSubscribed,
        pubsubTopic: notificationSetting?.pubsubTopic || null,
        rawResponse: json
      }
    } catch (error) {
      logger.error('Failed to check account pub/sub status', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }
}
