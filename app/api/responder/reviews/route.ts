/**
 * API Route: Process Google My Business Pub/Sub Notifications
 * 
 * This endpoint handles the processing of Google My Business Pub/Sub notifications
 * for review updates. It's designed to be triggered by external cron jobs or webhooks
 * to process review notifications in the background.
 * 
 * Flow:
 * 1. Fetch notifications from Google Pub/Sub (up to 50 parallel requests)
 * 2. Match notifications with active locations that have active subscriptions
 * 3. Fetch full review details from Google My Business API
 * 4. Generate AI responses using OpenAI
 * 5. Save example reviews to database
 * 6. Return immediate response (202 Accepted)
 * 
 * Main functionalities:
 * - Fetch and process Pub/Sub notifications from Google My Business
 * - Match notifications with active locations
 * - Generate automated responses to reviews using AI
 * - Store processed reviews in the database as examples
 * 
 * This operation can take several seconds depending on the number of notifications
 * and reviews to process.
 */

import { NextRequest, NextResponse } from 'next/server'
import { processPubSubNotifications } from '@/server/actions/gmb/pub-sub.action'
import { createLogger } from '@/lib/logger'

const logger = createLogger('API-PROCESS-PUBSUB')

export async function GET(request: NextRequest) {
  try {
    // Step 1: Authentication check for cron jobs
    // Allows requests from Vercel cron jobs (x-vercel-cron header) or external calls with CRON_SECRET
    const authHeader = request.headers.get('authorization')

    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`
    if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
      logger.warn('Unauthorized Pub/Sub processing attempt')
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid authorization' },
        { status: 401 }
      )
    }


    logger.info('Starting Pub/Sub notifications processing via API')

    // Step 2: Execute Pub/Sub processing in background (fire-and-forget)
    // We await this but handle errors gracefully to ensure a response is sent
    await processPubSubNotifications()
      .then(() => {
        logger.info('Pub/Sub notifications processing completed successfully')
      })
      .catch(error => {
        logger.error('Pub/Sub notifications processing failed', error)
      })

    // Step 3: Return immediate response (202 Accepted)
    return NextResponse.json(
      {
        success: true,
        message: 'Pub/Sub notifications processing started successfully'
      },
      { status: 202 }
    )

  } catch (error) {
    logger.error('Unexpected error in process-pub-sub API', error)
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      },
      { status: 500 }
    )
  }
}

