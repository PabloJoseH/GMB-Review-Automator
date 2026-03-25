/**
 * API Route: Sync Google My Business Accounts & Locations
 *
 * Handles syncing Google My Business accounts and locations to the database.
 * Runs sync in-request and returns the final result.
 *
 * Flow:
 * 1. Validate request body and userId
 * 2. Guard against concurrent sync for same user (idempotent)
 * 3. Ensure user has organization, create empty one if missing
 * 4. Execute syncAllGoogleAccountsWithLocations with token-retry
 * 5. Return sync result payload
 */

import { NextRequest, NextResponse } from 'next/server'
import { syncAllGoogleAccountsWithLocations } from '@/server/actions/gmb/accounts.action'
import { createLogger } from '@/lib/logger'
import { UsersModel } from '@/server/models/supabase/users.model'
import { OrganizationsModel } from '@/server/models/supabase/organizations.model'

const logger = createLogger('API-SYNC-ACCOUNTS')

/** In-memory guard to prevent concurrent syncs for the same user within a short window. */
const syncInProgress = new Set<string>()
const SYNC_COOLDOWN_MS = 45_000
const TOKEN_RETRY_ATTEMPTS = 3
const TOKEN_RETRY_DELAY_MS = 1500

/**
 * Executes Google accounts sync with short retries for token propagation delays.
 */
async function executeSyncWithRetry(clerkUserId: string) {
  let lastResult:
    | Awaited<ReturnType<typeof syncAllGoogleAccountsWithLocations>>
    | null = null

  for (let attempt = 1; attempt <= TOKEN_RETRY_ATTEMPTS; attempt += 1) {
    const result = await syncAllGoogleAccountsWithLocations(clerkUserId)
    lastResult = result

    if (result.success) return result

    const shouldRetryForToken =
      typeof result.message === 'string' &&
      result.message.toLowerCase().includes('google access token')

    if (!shouldRetryForToken || attempt === TOKEN_RETRY_ATTEMPTS) {
      return result
    }

    logger.warn('Google sync token not ready, retrying', {
      userId: clerkUserId,
      attempt,
      maxAttempts: TOKEN_RETRY_ATTEMPTS
    })

    await new Promise((resolve) => setTimeout(resolve, TOKEN_RETRY_DELAY_MS))
  }

  return (
    lastResult ?? {
      success: false,
      accountsCount: 0,
      locationsCount: 0,
      message: 'Sync failed without result'
    }
  )
}

export async function POST(request: NextRequest) {
  let guardUserId: string | null = null
  try {
    // Step 1: Parse request body
    let requestBody
    try {
      requestBody = await request.json()
    } catch (error) {
      logger.warn('Invalid JSON in sync-accounts request', { error })
      return NextResponse.json(
        { error: 'Invalid request', message: 'Request body must be valid JSON' },
        { status: 400 }
      )
    }

    const { userId: clerkUserId } = requestBody

    // Step 2: Validate userId is provided
    if (!clerkUserId) {
      logger.warn('Missing userId in sync-accounts request')
      return NextResponse.json(
        { error: 'Bad request', message: 'userId is required' },
        { status: 400 }
      )
    }

    if (syncInProgress.has(clerkUserId)) {
      logger.info('Sync already in progress for user, skipping duplicate request', {
        userId: clerkUserId
      })
      return NextResponse.json(
        {
          success: true,
          message: 'Sync already in progress',
          userId: clerkUserId
        },
        { status: 202 }
      )
    }

    syncInProgress.add(clerkUserId)
    guardUserId = clerkUserId

    logger.info('Starting Google accounts sync via API', {
      userId: clerkUserId
    })

    // Step 3: Ensure user has an organization, create empty one if missing
    const { user: dbUser, organization } = await UsersModel.getUserAndOrganization(clerkUserId)
    
    if (!dbUser) {
      syncInProgress.delete(clerkUserId)
      logger.error('User not found in database', { clerkUserId })
      return NextResponse.json(
        { error: 'User not found', message: 'User not found in database' },
        { status: 404 }
      )
    }

    let organizationToUse = organization
    
    if (!organizationToUse) {
      logger.info('Organization not found, creating empty organization', {
        userId: clerkUserId,
        dbUserId: dbUser.id
      })
      
      // Create empty organization
      const newOrganization = await OrganizationsModel.createOrganization({
        created_by: dbUser.id,
        first_line_of_address: '',
        city: '',
        zip_code: '',
        country: ''
      })
      
      // Update user to associate with new organization
      await UsersModel.updateUser(dbUser.id, {
        organization_id: newOrganization.id
      })
      
      organizationToUse = newOrganization
      
      logger.info('Empty organization created and associated with user', {
        userId: clerkUserId,
        organizationId: newOrganization.id
      })
    }

    // Step 4: Execute sync and retry when token is not ready yet
    const syncResult = await executeSyncWithRetry(clerkUserId)

    if (syncResult.success) {
      logger.info('Google accounts sync completed successfully', {
        userId: clerkUserId,
        result: syncResult
      })
    } else {
      logger.warn('Google accounts sync finished with failure', {
        userId: clerkUserId,
        result: syncResult
      })
    }

    // Step 5: Return sync result
    return NextResponse.json(
      {
        success: syncResult.success,
        message: syncResult.message,
        userId: clerkUserId,
        accountsCount: syncResult.accountsCount,
        locationsCount: syncResult.locationsCount
      },
      { status: syncResult.success ? 200 : 409 }
    )

  } catch (error) {
    logger.error('Unexpected error in sync-accounts API', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      },
      { status: 500 }
    )
  } finally {
    // Keep a short cooldown to avoid duplicated sync storms from repeated clicks.
    if (guardUserId) {
      const userIdToClear = guardUserId
      setTimeout(() => {
        syncInProgress.delete(userIdToClear)
      }, SYNC_COOLDOWN_MS)
    }
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed', message: 'Only POST requests are supported' },
    { status: 405 }
  )
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed', message: 'Only POST requests are supported' },
    { status: 405 }
  )
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed', message: 'Only POST requests are supported' },
    { status: 405 }
  )
}
