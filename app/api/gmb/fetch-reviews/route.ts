/**
 * API Route: Fetch Google My Business Reviews
 * 
 * This endpoint handles the heavy operation of fetching and processing Google My Business
 * reviews for all user locations. It's designed to run in the background during
 * the payment setup step without blocking the user interface.
 * 
 * Flow:
 * 1. Validate authentication and request data
 * 2. Check if reviews have already been processed (prompt context exists)
 * 3. If already processed, return 409 Conflict
 * 4. Execute processGoogleReviews in background (fire-and-forget)
 * 5. Return immediate response (200 OK)
 * 6. Continue processing even if response is sent
 * 
 * This prevents Vercel timeouts for operations that can take several seconds
 * when processing multiple locations with many reviews.
 */

import { NextRequest, NextResponse } from 'next/server'
import { processGoogleReviews } from '@/server/actions/gmb/reviews.action'
import { createLogger } from '@/lib/logger'
import { PromptContextModel } from '@/server/models/supabase/prompt-context.model'
import { LocationsModel } from '@/server/models/supabase/locations.model'
import { UsersModel } from '@/server/models/supabase/users.model'
import { APP_CONSTANTS } from '@/lib/constants'

const logger = createLogger('API-FETCH-REVIEWS')

export async function POST(request: NextRequest) {
  try {
    // Step 1: Parse request body
    let requestBody
    try {
      requestBody = await request.json()
    } catch (error) {
      logger.warn('Invalid JSON in fetch-reviews request', { error })
      return NextResponse.json(
        { error: 'Invalid request', message: 'Request body must be valid JSON' },
        { status: 400 }
      )
    }

    const { userId: clerkUserId, dbUserId, userData } = requestBody

    // Step 2: Validate required fields
    if (!clerkUserId) {
      logger.warn('Missing userId in fetch-reviews request')
      return NextResponse.json(
        { error: 'Bad request', message: 'userId is required' },
        { status: 400 }
      )
    }

    if (!userData) {
      logger.warn('Missing userData in fetch-reviews request')
      return NextResponse.json(
        { error: 'Bad request', message: 'userData is required' },
        { status: 400 }
      )
    }

    if (!dbUserId) {
      logger.warn('Missing dbUserId in fetch-reviews request', { clerkUserId })
      return NextResponse.json(
        { error: 'Bad request', message: 'dbUserId is required' },
        { status: 400 }
      )
    }

    // Step 3: Validate userData structure
    if (!userData.id || !userData.emailAddresses || !Array.isArray(userData.emailAddresses)) {
      logger.warn('Invalid userData structure in fetch-reviews request', { userData })
      return NextResponse.json(
        { error: 'Bad request', message: 'Invalid userData structure' },
        { status: 400 }
      )
    }

    logger.info('Starting Google reviews fetch via API', {
      userId: clerkUserId,
      dbUserId,
      userEmail: userData.emailAddresses[0]?.emailAddress
    })

    // Step 3.5: Check if reviews have already been processed (prompt context exists)
    const dbUser = await UsersModel.findUserByClerkId(clerkUserId)
    if (!dbUser) {
      logger.warn('User not found in database', { clerkUserId })
      return NextResponse.json(
        { error: 'Bad request', message: 'User not found in database' },
        { status: 400 }
      )
    }

    // Build the same where clause that processGoogleReviews uses
    const whereClause = {
      created_by: dbUser.id,
      status: 'active' as const
    }

    // Get user's locations to check for existing prompt contexts
    const locations = await LocationsModel.findFilteredLocations(
      whereClause,
      APP_CONSTANTS.gmb.maxLocationsLimit
    )

    if (locations && locations.length > 0) {
      const locationIds = locations.map(loc => loc.id)
      const hasExistingPromptContext = await PromptContextModel.existsForAnyLocation(locationIds)

      if (hasExistingPromptContext) {
        logger.info('Reviews already processed - prompt context exists', {
          userId: clerkUserId,
          locationCount: locations.length
        })
        return NextResponse.json(
          {
            success: false,
            error: 'Conflict',
            message: 'Reviews have already been processed for this user',
            alreadyProcessed: true
          },
          { status: 409 }
        )
      }
    }

    // Step 4: Execute reviews processing in background (fire-and-forget)
    // We don't await this to prevent blocking the response
    // Note: processGoogleReviews only needs clerkUserId, filters are optional
    await processGoogleReviews(clerkUserId)
      .then(result => {
        logger.info('Google reviews processing completed successfully', {
          userId: clerkUserId,
          totalReviews: result.totalReviews,
          savedReviews: result.savedReviews,
          updatedReviews: result.updatedReviews,
          locationsProcessed: result.locations.length
        })
      })
      .catch(error => {
        logger.error('Google reviews processing failed', error, {
          userId: clerkUserId
        })
        return NextResponse.json(
          {
            success: false,
            error: 'Google reviews processing failed',
            message: 'Google reviews processing failed',
            userId: clerkUserId
          },
          { status: 500 }
        )
      })

    // Step 6: Return response (200 OK)
    return NextResponse.json(
      {
        success: true,
        message: 'Reviews processing started successfully',
        userId: clerkUserId
      },
      { status: 200 }
    )

  } catch (error) {
    logger.error('Unexpected error in fetch-reviews API', error)
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      },
      { status: 500 }
    )
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
