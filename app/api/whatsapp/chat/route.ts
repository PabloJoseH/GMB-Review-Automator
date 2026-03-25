/**
 * WhatsApp Webhook Route
 * 
 * This endpoint handles incoming WhatsApp webhook messages for onboarding:
 * - Receives webhook payload from WhatsApp Business API
 * - Validates webhook signature for security
 * - Processes incoming messages through onboarding flow
 * - Returns appropriate HTTP responses
 * 
 * Flow:
 * 1. Validate webhook signature (if configured)
 * 2. Parse incoming WhatsApp message payload
 * 3. Process message through onboarding action
 * 4. Return success/error response
 * 
 * Main functionalities:
 * - Handle WhatsApp webhook verification
 * - Process incoming messages for user onboarding
 * - Generate AI responses and send via WhatsApp
 * - Maintain conversation sessions
 */

import { NextRequest, NextResponse } from 'next/server'
import { processWhatsAppMessage } from '@/server/actions/whatsapp/responder.action'
import { type IncomingMessage } from '@/server/models/whatsapp/message.model'
import { createLogger } from '@/lib/logger'
import { APP_CONSTANTS } from '@/lib/constants'
import { previewString } from '@/lib/utils'
import crypto from 'crypto'

const logger = createLogger('WhatsApp-Webhook')

/**
 * Verify webhook signature for security
 */
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    )
  } catch (error) {
    logger.error('Error verifying webhook signature', error)
    return false
  }
}

/**
 * Handle WhatsApp webhook verification (GET request)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    logger.debug('WhatsApp webhook verification request', {
      mode,
      token: token ? 'provided' : 'missing',
      challenge: challenge ? 'provided' : 'missing'
    })

    // Verify the webhook
    if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      logger.debug('WhatsApp webhook verified successfully')
      return new NextResponse(challenge, { status: 200 })
    } else {
      logger.debug('WhatsApp webhook verification failed', {
        mode,
        tokenMatch: token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
      })
      return new NextResponse('Forbidden', { status: 403 })
    }
  } catch (error) {
    logger.error('Error in WhatsApp webhook verification', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

/**
 * Handle incoming WhatsApp messages (POST request)
 * Extended timeout configured for OpenAI web search operations
 */
export const maxDuration = 300; // 5 minutes in seconds
export async function POST(request: NextRequest) {
  try {
    // Step 1: Get request body and headers
    const body = await request.text()
    const signature = request.headers.get('x-hub-signature-256') || ''
    
    logger.debug('Received WhatsApp webhook', {
      bodyLength: body.length,
      hasSignature: !!signature,
      contentType: request.headers.get('content-type')
    })

    // Step 2: Verify webhook signature if secret is configured
    if (process.env.WHATSAPP_WEBHOOK_SECRET) {
      const isValidSignature = verifyWebhookSignature(
        body,
        signature.replace('sha256=', ''),
        process.env.WHATSAPP_WEBHOOK_SECRET
      )

      if (!isValidSignature) {
        logger.debug('Invalid webhook signature', {
          signature: previewString(signature, APP_CONSTANTS.whatsapp.logging.signaturePreviewLength),
          bodyLength: body.length
        })
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 403 }
        )
      }
    }

    // Step 3: Parse webhook payload
    const webhookData = JSON.parse(body)
    
    logger.debug('Webhook payload structure', {
      hasEntry: !!webhookData.entry,
      entryCount: webhookData.entry?.length || 0,
      object: webhookData.object,
      hasDirectMessages: !!webhookData.messages,
      directMessagesCount: webhookData.messages?.length || 0
    })

    // Step 4: Handle two different webhook formats
    let messagesToProcess: IncomingMessage[] = []
    let contactsFromWebhook: Array<{ profile: { name: string }, wa_id: string }> = []

    // Format 1: Standard WhatsApp Business API format (metadata.phone_number_id required for media)
    if (webhookData.object === 'whatsapp_business_account' && webhookData.entry) {
      for (const entry of webhookData.entry) {
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'messages' && change.value?.messages) {
              if (change.value.contacts) {
                contactsFromWebhook = change.value.contacts
              }
              const phoneNumberId = change.value.metadata?.phone_number_id ?? ''
              for (const msg of change.value.messages) {
                messagesToProcess.push({ ...msg, to: phoneNumberId } as IncomingMessage)
              }
            }
          }
        }
      }
    }
    // Format 2: Direct messages format (for testing or custom webhooks)
    else if (webhookData.messages && Array.isArray(webhookData.messages)) {
      if (webhookData.contacts) {
        contactsFromWebhook = webhookData.contacts
      }
      const phoneNumberId = webhookData.metadata?.phone_number_id ?? ''
      for (const msg of webhookData.messages) {
        messagesToProcess.push({ ...msg, to: msg.to ?? phoneNumberId } as IncomingMessage)
      }
      logger.debug('Using direct messages format', {
        messageCount: messagesToProcess.length,
        contactsCount: contactsFromWebhook.length
      })
    }

    // Step 5: Process each message
    if (messagesToProcess.length > 0) {
      for (const message of messagesToProcess) {
        try {
          logger.debug('Processing WhatsApp message', {
            messageId: message.id,
            from: message.from,
            type: message.type,
            timestamp: message.timestamp
          })

          // Add contacts to message if available
          const messageWithContacts = {
            ...message,
            contacts: contactsFromWebhook.length > 0 ? contactsFromWebhook : message.contacts || []
          }

          // Process message through onboarding action
          const result = await processWhatsAppMessage(messageWithContacts as IncomingMessage)

          if (result.success) {
            logger.debug('Message processed successfully', {
              messageId: result.messageId,
              userId: result.userId,
              sessionId: result.sessionId
            })
          } else {
            logger.error('Message processing failed', {
              error: result.error,
              messageId: message.id
            })
          }
        } catch (messageError) {
          logger.error('Error processing individual message', {
            error: messageError instanceof Error ? messageError.message : 'Unknown error',
            messageId: message.id,
            from: message.from
          })
        }
      }
    } else {
      logger.debug('No messages found in webhook payload', {
        webhookDataKeys: Object.keys(webhookData)
      })
    }

    // Step 6: Return success response
    return NextResponse.json(
      { 
        success: true, 
        message: 'Webhook processed successfully',
        messagesProcessed: messagesToProcess.length
      },
      { status: 200 }
    )

  } catch (error) {
    logger.error('Error processing WhatsApp webhook', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Failed to process webhook'
      },
      { status: 500 }
    )
  }
}
