/**
 * OAuth Token Action - Google OAuth2 Token Management
 * 
 * This action handles OAuth2 token operations for Google Cloud Pub/Sub authentication.
 * 
 * Main functionalities:
 * - Generate OAuth2 authorization URL
 * - Exchange authorization code for tokens
 * - Get current token information
 * 
 * Usage:
 * This is a Next.js 15 server action that can be called from the client or other server components.
 */

'use server'

import { OAuth2Client } from 'google-auth-library'
import { createLogger } from '@/lib/logger'
import { requireServerActionUser } from '@/lib/server-action-auth'

const logger = createLogger('OAuthTokenAction')

// Scopes required for Pub/Sub
const PUBSUB_SCOPES = [
  'https://www.googleapis.com/auth/pubsub'
]

// Redirect URI - must be configured in Google Cloud Console
const REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth2callback'

/**
 * Create OAuth2 client instance
 * @returns OAuth2Client or null if credentials are not configured
 */
function createOAuth2Client(): OAuth2Client | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    logger.error('OAuth2 credentials not configured')
    return null
  }

  return new OAuth2Client(clientId, clientSecret, REDIRECT_URI)
}

/**
 * Generate OAuth2 authorization URL
 * 
 * @returns Object with authorization URL and error if any
 */
export async function generateAuthUrl(): Promise<{
  url?: string
  error?: string
  redirectUri?: string
}> {
  try {
    await requireServerActionUser()

    const oauth2Client = createOAuth2Client()

    if (!oauth2Client) {
      return {
        error: 'OAuth2 credentials not configured. Please set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET environment variables.'
      }
    }

    // Generate authorization URL
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Required to obtain a refresh token
      scope: PUBSUB_SCOPES,
      prompt: 'consent' // Force consent screen to receive a refresh token
    })

    logger.info('OAuth2 authorization URL generated successfully')

    return {
      url,
      redirectUri: REDIRECT_URI
    }
  } catch (error) {
    logger.error('Error generating authorization URL', { error })
    return {
      error: error instanceof Error ? error.message : 'Unknown error generating authorization URL'
    }
  }
}

/**
 * Exchange authorization code for OAuth2 tokens
 * 
 * @param code - Authorization code from OAuth2 redirect
 * @returns Object with tokens and error if any
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken?: string
  refreshToken?: string
  expiryDate?: string
  error?: string
}> {
  try {
    await requireServerActionUser()

    if (!code || typeof code !== 'string') {
      return {
        error: 'Invalid authorization code provided'
      }
    }

    const oauth2Client = createOAuth2Client()

    if (!oauth2Client) {
      return {
        error: 'OAuth2 credentials not configured. Please set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET environment variables.'
      }
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      logger.warn('Refresh token not received. This might happen if the user already authorized the app.')
      return {
        error: 'Refresh token not received. Try revoking the app access and authorizing again.'
      }
    }

    logger.info('Tokens obtained successfully', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date
    })

    return {
      accessToken: tokens.access_token || undefined,
      refreshToken: tokens.refresh_token || undefined,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined
    }
  } catch (error) {
    logger.error('Error exchanging code for tokens', { error })
    
    let errorMessage = 'Unknown error exchanging code for tokens'
    
    if (error instanceof Error) {
      if (error.message.includes('invalid_grant')) {
        errorMessage = 'Invalid or expired authorization code. Please try again.'
      } else if (error.message.includes('redirect_uri_mismatch')) {
        errorMessage = `Redirect URI mismatch. Expected: ${REDIRECT_URI}. Please update your Google Cloud Console configuration.`
      } else {
        errorMessage = error.message
      }
    }

    return {
      error: errorMessage
    }
  }
}

/**
 * Get current OAuth2 token information
 * 
 * @returns Object with token information and error if any
 */
export async function getTokenInfo(): Promise<{
  hasClientId?: boolean
  hasClientSecret?: boolean
  hasRefreshToken?: boolean
  redirectUri?: string
  scopes?: string[]
  error?: string
}> {
  try {
    await requireServerActionUser()

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
    const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN

    return {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasRefreshToken: !!refreshToken,
      redirectUri: REDIRECT_URI,
      scopes: PUBSUB_SCOPES
    }
  } catch (error) {
    logger.error('Error getting token info', { error })
    return {
      error: error instanceof Error ? error.message : 'Unknown error getting token info'
    }
  }
}

/**
 * Verify OAuth2 configuration
 * 
 * @returns Object with configuration status
 */
export async function verifyOAuth2Config(): Promise<{
  isConfigured: boolean
  missingVariables: string[]
  message: string
}> {
  await requireServerActionUser()

  const missingVariables: string[] = []

  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
    missingVariables.push('GOOGLE_OAUTH_CLIENT_ID')
  }
  if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    missingVariables.push('GOOGLE_OAUTH_CLIENT_SECRET')
  }
  if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    missingVariables.push('GOOGLE_OAUTH_REFRESH_TOKEN')
  }

  const isConfigured = missingVariables.length === 0

  let message = ''
  if (isConfigured) {
    message = 'OAuth2 is fully configured and ready to use.'
  } else {
    message = `Missing required environment variables: ${missingVariables.join(', ')}`
  }

  logger.info('OAuth2 configuration verified', { isConfigured, missingVariables })

  return {
    isConfigured,
    missingVariables,
    message
  }
}

/**
 * Revoke OAuth2 tokens
 * 
 * @returns Object with success status and error if any
 */
export async function revokeTokens(): Promise<{
  success: boolean
  message: string
  error?: string
}> {
  try {
    await requireServerActionUser()

    const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN

    if (!refreshToken) {
      return {
        success: false,
        message: 'No refresh token configured to revoke.'
      }
    }

    const oauth2Client = createOAuth2Client()

    if (!oauth2Client) {
      return {
        success: false,
        message: 'OAuth2 credentials not configured.'
      }
    }

    // Set the refresh token
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    })

    // Revoke the token
    await oauth2Client.revokeCredentials()

    logger.info('OAuth2 tokens revoked successfully')

    return {
      success: true,
      message: 'Tokens revoked successfully. You will need to re-authorize the application.'
    }
  } catch (error) {
    logger.error('Error revoking tokens', { error })
    return {
      success: false,
      message: 'Failed to revoke tokens.',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

