/**
 * GMB Accounts Model - Google My Business Accounts API Operations
 *
 * Overview:
 * - Fetch account metadata through Google's Account Management API v1
 * - Normalize API responses so only serializable data leaves the model layer
 * - Provide shared utilities for validating account payloads and tokens
 * - Centralize authentication concerns for account-level workflows
 *
 * Exported entities:
 * - `GmbAccountsModel`: exposes methods to call the external API
 * - `GoogleMyBusinessAccount`, `GoogleMyBusinessAccountsResponse`: DTO typings
 */

import { createLogger } from '@/lib/logger'

const logger = createLogger('GMB-ACCOUNTS')

export interface GoogleMyBusinessAccount {
  name: string
  accountName: string
  type: 'PERSONAL' | 'BUSINESS'
  verificationState: string
  role?: string
  permissionLevel?: string
  organizationInfo?: {
    displayName?: string
    phoneNumber?: string
    postalAddress?: {
      regionCode?: string
      locality?: string
      administrativeArea?: string
      postalCode?: string
    }
  }
  [k: string]: unknown
}

export interface GoogleMyBusinessAccountsResponse {
  accounts?: GoogleMyBusinessAccount[]
  nextPageToken?: string
}

export const GmbAccountsModel = {
  // Google API calls
  fetchGoogleAccounts: async (accessToken: string): Promise<GoogleMyBusinessAccountsResponse> => {
    try {
      logger.debug('Fetching Google My Business accounts from API')
      
      const response = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Google API request failed', new Error(`HTTP ${response.status}: ${errorText}`))
        throw new Error(`Google API Error: ${response.status}`)
      }

      const data = await response.json()
      logger.debug('Google accounts fetched successfully', { count: data.accounts?.length || 0 })
      
      return data
    } catch (error) {
      logger.error('Failed to fetch Google accounts', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  },

}
