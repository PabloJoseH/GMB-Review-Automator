/**
 * WhatsApp Server Actions
 * 
 * This module provides server actions for handling WhatsApp messages:
 * - Webhook handler for incoming messages
 * - Send message actions (text, image, document, location)
 * - Send template messages (sign_in, account_creation, proposed_responses)
 * - Typing indicator
 * - Message status updates
 * - Uses WHATSAPP_ACCESS_TOKEN from environment variables directly
 */

'use server';

import { WhatsAppMessageService, MessageUtils, type IncomingMessage, type OutgoingMessage } from '../../models/whatsapp/message.model';
import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { UsersModel } from '@/server/models/supabase/users.model';
import { ProposedResponsesModel } from '@/server/models/supabase/proposed-responses.model';
import { APP_CONSTANTS } from '@/lib/constants';

const logger = createLogger('WhatsAppSendMessageAction');

/**
 * Helper function to get WhatsApp message service using environment variables
 */
async function getWhatsAppMessageService(): Promise<WhatsAppMessageService> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  
  if (!accessToken) {
    throw new Error('WHATSAPP_ACCESS_TOKEN is not configured in environment variables');
  }

  return new WhatsAppMessageService(
    accessToken,
    process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    process.env.WHATSAPP_API_VERSION || APP_CONSTANTS.whatsapp.api.legacyVersion
  );
}

/**
 * Handle incoming WhatsApp webhook
 * Processes incoming messages and sends auto-replies
 */
export async function handleWhatsAppWebhook(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';
    
    // Verify webhook signature for security
    const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET || '';
    const whatsappService = await getWhatsAppMessageService();
    const isValidSignature = await whatsappService.verifyWebhookSignature(
      body,
      signature,
      webhookSecret
    );

    if (!isValidSignature) {
      logger.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const webhookData = JSON.parse(body);
    
    // Process incoming message
    const message = await whatsappService.processIncomingMessage(webhookData);
    
    if (message) {
      // Send auto-reply
      await sendAutoReply(message);
      
      // Here you can add your business logic:
      // - Save message to database
      // - Trigger AI response
      // - Forward to staff
      // - etc.
      
      logger.debug('Message processed successfully', { messageId: message.id });
    }

    // Process status updates
    const statusUpdate = await whatsappService.processStatusUpdate(webhookData);
    if (statusUpdate) {
      // Update message status in database
      logger.debug('Status updated', { id: statusUpdate.id, status: statusUpdate.status });
    }

    return NextResponse.json({ status: 'success' });
  } catch (error) {
    logger.error('Error handling WhatsApp webhook', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Send auto-reply message
 */
async function sendAutoReply(message: IncomingMessage) {
  try {
    const isBusinessHours = MessageUtils.isBusinessHours(message.timestamp);
    
    let autoReplyText: string;
    if (!isBusinessHours) {
      autoReplyText = "Thank you for your message. We're currently outside business hours (9 AM - 6 PM, Monday to Friday). We'll get back to you as soon as possible.";
    } else {
      switch (message.type) {
        case 'text':
          autoReplyText = "Thank you for your message. We'll respond shortly.";
          break;
        case 'image':
          autoReplyText = "Thank you for sharing the image. We'll review it and get back to you.";
          break;
        case 'document':
          autoReplyText = "Thank you for the document. We'll review it and respond accordingly.";
          break;
        default:
          autoReplyText = "Thank you for your message. We'll get back to you shortly.";
      }
    }
    
    const whatsappService = await getWhatsAppMessageService();
    await whatsappService.sendTextMessage(message.from, autoReplyText);
    
    logger.debug('Auto-reply sent', { to: message.from });
  } catch (error) {
    logger.error('Error sending auto-reply', error);
  }
}

/**
 * Send text message action
 */
export async function sendTextMessageAction(phoneNumber: string, text: string) {
  try {
    const formattedNumber = MessageUtils.formatPhoneNumber(phoneNumber);
    const whatsappService = await getWhatsAppMessageService();
    const response = await whatsappService.sendTextMessage(formattedNumber, text);
    
    if (response) {
      return {
        success: true,
        messageId: response.messages[0]?.id,
        message: 'Message sent successfully'
      };
    } else {
      return {
        success: false,
        message: 'Failed to send message'
      };
    }
  } catch (error) {
    logger.error('Error sending text message', error);
    return {
      success: false,
      message: 'Error sending message'
    };
  }
}

/**
 * Send image message action
 */
export async function sendImageMessageAction(phoneNumber: string, imageUrl: string, caption?: string) {
  try {
    const formattedNumber = MessageUtils.formatPhoneNumber(phoneNumber);
    const whatsappService = await getWhatsAppMessageService();
    const response = await whatsappService.sendImageMessage(formattedNumber, imageUrl, caption);
    
    if (response) {
      return {
        success: true,
        messageId: response.messages[0]?.id,
        message: 'Image sent successfully'
      };
    } else {
      return {
        success: false,
        message: 'Failed to send image'
      };
    }
  } catch (error) {
    logger.error('Error sending image message', error);
    return {
      success: false,
      message: 'Error sending image'
    };
  }
}

/**
 * Send document message action
 */
export async function sendDocumentMessageAction(phoneNumber: string, documentUrl: string, filename?: string, caption?: string) {
  try {
    const formattedNumber = MessageUtils.formatPhoneNumber(phoneNumber);
    const whatsappService = await getWhatsAppMessageService();
    const response = await whatsappService.sendDocumentMessage(formattedNumber, documentUrl, filename, caption);
    
    if (response) {
      return {
        success: true,
        messageId: response.messages[0]?.id,
        message: 'Document sent successfully'
      };
    } else {
      return {
        success: false,
        message: 'Failed to send document'
      };
    }
  } catch (error) {
    logger.error('Error sending document message', error);
    return {
      success: false,
      message: 'Error sending document'
    };
  }
}

/**
 * Send location message action
 */
export async function sendLocationMessageAction(
  phoneNumber: string, 
  latitude: number, 
  longitude: number, 
  name?: string, 
  address?: string
) {
  try {
    const formattedNumber = MessageUtils.formatPhoneNumber(phoneNumber);
    const whatsappService = await getWhatsAppMessageService();
    const response = await whatsappService.sendLocationMessage(
      formattedNumber, 
      latitude, 
      longitude, 
      name, 
      address
    );
    
    if (response) {
      return {
        success: true,
        messageId: response.messages[0]?.id,
        message: 'Location sent successfully'
      };
    } else {
      return {
        success: false,
        message: 'Failed to send location'
      };
    }
  } catch (error) {
    logger.error('Error sending location message', error);
    return {
      success: false,
      message: 'Error sending location'
    };
  }
}

/**
 * Generic send message action
 */
export async function sendMessageAction(message: OutgoingMessage) {
  try {
    const whatsappService = await getWhatsAppMessageService();
    const response = await whatsappService.sendMessage(message);
    
    if (response) {
      return {
        success: true,
        messageId: response.messages[0]?.id,
        message: 'Message sent successfully'
      };
    } else {
      return {
        success: false,
        message: 'Failed to send message'
      };
    }
  } catch (error) {
    logger.error('Error sending message', error);
    return {
      success: false,
      message: 'Error sending message'
    };
  }
}

/**
 * Send typing indicator action
 * Shows "is typing" indicator in the WhatsApp chat
 * Based on WhatsApp Business API typing indicator format
 */
export async function sendTypingIndicatorAction(waId: string, messageId: string) {
  try {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    const apiVersion = process.env.WHATSAPP_API_VERSION || APP_CONSTANTS.whatsapp.api.defaultVersion;
    
    if (!accessToken || !phoneNumberId) {
      logger.debug('WhatsApp credentials not configured for typing indicator');
      return {
        success: false,
        message: 'WhatsApp credentials not configured'
      };
    }
    
    if (!messageId) {
      logger.debug('Message ID is required for typing indicator');
      return {
        success: false,
        message: 'Message ID is required'
      };
    }
    
    const endpoint = `${APP_CONSTANTS.whatsapp.api.baseUrl}/${apiVersion}/${phoneNumberId}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      to: waId,
      status: 'read',
      message_id: messageId,
      typing_indicator: {
        type: 'text',
      }
    };
    
    logger.debug('Sending typing indicator', { waId, messageId, endpoint });
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    logger.debug('Typing indicator response status', { status: response.status });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to send typing indicator', {
        status: response.status,
        error: errorText
      });
      return {
        success: false,
        message: 'Failed to send typing indicator'
      };
    }
    
    const data = await response.json();
    logger.debug('Typing indicator sent successfully', { waId, messageId });
    
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
      message: 'Typing indicator sent successfully'
    };
  } catch (error) {
    logger.error('Error sending typing indicator', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return {
      success: false,
      message: 'Error sending typing indicator'
    };
  }
}

/**
 * Verify webhook endpoint
 * Used by WhatsApp to verify your webhook URL
 */
export async function verifyWebhook(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || '';
  
  if (mode === 'subscribe' && token === verifyToken) {
    logger.debug('Webhook verified successfully');
    return new NextResponse(challenge);
  } else {
    logger.error('Webhook verification failed');
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
  }
}

/**
 * Send WhatsApp template action
 * Sends WhatsApp templates for sign_in, account_creation, or proposed_responses
 */
export async function sendWhatsAppTemplateAction(
  userId: string,
  args: { template_type: 'sign_in' | 'account_creation' | 'proposed_responses'; locale?: string; reauth?: boolean }
): Promise<{ success: true; messageId?: string; url: string } | { error: string }> {
  try {
    if (!userId) return { error: 'Missing user context' };

    const user = await UsersModel.findUserById(userId);
    if (!user || !user.wa_id) return { error: 'User not found or missing WhatsApp id' };

    const displayName = user.username?.trim() || user.name?.trim() || user.lastname?.trim() || 'Usuario';
    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
      'http://localhost:3000';

    const locale = args.locale || 'es';
    
    // Map locale to WhatsApp language code
    // WhatsApp templates use: 'en' for English, 'es' for Spanish, 'en_US' for English (US)
    let languageCode: string;
    if (locale.startsWith('en')) {
      // Use 'en' for English templates (works for both 'en' and 'en_US' locales)
      languageCode = 'en';
    } else if (locale.startsWith('es')) {
      languageCode = 'es';
    } else {
      // Default to Spanish if locale is not recognized
      languageCode = 'es';
    }

    // Determine template name and URL based on template_type
    let templateName: string;
    let urlParam: string;
    let urlLanguageCode: string; // For URL, use the original locale format

    switch (args.template_type) {
      case 'sign_in':
        templateName = 'sign_in';
        urlLanguageCode = locale.includes('_') ? locale.split('_')[0] : locale;
        const reauthSuffix = args.reauth ? '&reauth=true' : '';
        urlParam = `${urlLanguageCode}/sign-in?u=${encodeURIComponent(user.id)}${reauthSuffix}`;
        break;
      case 'account_creation':
        templateName = 'account_creation';
        urlLanguageCode = locale.includes('_') ? locale.split('_')[0] : locale;
        const reauthSuffixSignUp = args.reauth ? '&reauth=true' : '';
        urlParam = `${urlLanguageCode}/sign-up?u=${encodeURIComponent(user.id)}${reauthSuffixSignUp}`;
        break;
      case 'proposed_responses':
        templateName = 'proposed_responses';
        urlLanguageCode = locale.includes('_') ? locale.split('_')[0] : locale;
        urlParam = `${urlLanguageCode}/proposed-responses`;
        break;
      default:
        return { error: `Invalid template_type: ${args.template_type}` };
    }

    const apiVersion = process.env.WHATSAPP_API_VERSION || APP_CONSTANTS.whatsapp.api.defaultVersion;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    
    if (!phoneNumberId || !accessToken) {
      return { error: 'WhatsApp credentials not configured' };
    }

    const endpoint = `${APP_CONSTANTS.whatsapp.api.baseUrl}/${apiVersion}/${phoneNumberId}/messages`;
    
    // Build the full URL for the button
    // Ensure appBaseUrl doesn't have trailing slash
    const normalizedBaseUrl = appBaseUrl.replace(/\/$/, '');
    
    // For account_creation, check if urlParam already contains a full URL and extract relative path
    let processedUrlParam = urlParam;
    if (args.template_type === 'account_creation') {
      // Check if urlParam contains a full URL (starts with http:// or https://)
      if (urlParam.startsWith('http://') || urlParam.startsWith('https://')) {
        try {
          // Parse the URL to extract the pathname and search params
          const urlObj = new URL(urlParam);
          // Extract pathname (without leading slash) + search params
          processedUrlParam = urlObj.pathname.replace(/^\//, '') + urlObj.search;
          logger.debug('Extracted relative path from full URL', {
            originalUrlParam: urlParam,
            extractedPath: processedUrlParam
          });
        } catch {
          // If URL parsing fails, try to extract path manually
          const urlMatch = urlParam.match(/https?:\/\/[^\/]+(\/.+)/);
          if (urlMatch && urlMatch[1]) {
            processedUrlParam = urlMatch[1].replace(/^\//, '');
            logger.debug('Manually extracted relative path from URL', {
              originalUrlParam: urlParam,
              extractedPath: processedUrlParam
            });
          }
        }
      }
    }
    
    // Normalize the processed URL param (remove leading slash if present)
    const normalizedUrlParam = processedUrlParam.startsWith('/') ? processedUrlParam.slice(1) : processedUrlParam;
    
    // Build components array - body parameters vary by template type
    // sign_in: 1 parameter (displayName), static URL button (no button component)
    // account_creation: 1 parameter (displayName), dynamic URL button (includes button component)
    // proposed_responses: 2 parameters (displayName, count of proposed responses), static URL button (no button component)
    const components: Array<{
      type: string;
      parameters?: Array<{ type: string; text: string }>;
      sub_type?: string;
      index?: string;
    }> = [];
    
    // Build body parameters based on template type
    if (args.template_type === 'proposed_responses') {
      // proposed_responses template expects 2 parameters: displayName and count of proposed responses
      const proposedResponsesCount = await ProposedResponsesModel.count({ user_id: userId });
      const countText = proposedResponsesCount.toString();
      components.push({
        type: 'body',
        parameters: [
          { type: 'text', text: displayName },
          { type: 'text', text: countText }
        ]
      });
    } else {
      // sign_in and account_creation templates expect 1 parameter
      components.push({
        type: 'body',
        parameters: [{ type: 'text', text: displayName }]
      });
    }
    
    // Add button component only for account_creation template
    // sign_in and proposed_responses templates have static URL buttons that don't accept parameters
    if (args.template_type === 'account_creation') {
      // For account_creation, the template already includes the base URL and locale
      // So we only need to pass the relative path without the locale prefix
      // urlParam format: "es/sign-up?u=..." -> we need: "sign-up?u=..."
      const relativePath = normalizedUrlParam.includes('/') 
        ? normalizedUrlParam.split('/').slice(1).join('/') 
        : normalizedUrlParam;
      
      logger.debug('Building account_creation button URL', {
        appBaseUrl,
        originalUrlParam: urlParam,
        processedUrlParam,
        normalizedBaseUrl,
        normalizedUrlParam,
        relativePath
      });
      
      components.push({ 
        type: 'button', 
        sub_type: 'url', 
        index: '0', 
        parameters: [{ type: 'text', text: relativePath }] 
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: user.wa_id,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components
      }
    };

    logger.debug('Sending WhatsApp template', {
      templateName,
      languageCode,
      urlParam,
      userId,
      waId: user.wa_id
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error('Failed to send template', {
        status: response.status,
        statusText: response.statusText,
        error: errText,
        templateType: args.template_type,
        templateName,
        languageCode,
        userId,
        payload: JSON.stringify(payload)
      });
      return { error: `Failed to send template: ${response.status} - ${errText}` };
    }

    const data = await response.json();
    logger.debug('Template sent', {
      to: user.wa_id,
      messageId: data?.messages?.[0]?.id,
      templateType: args.template_type,
      userId,
      url: `${appBaseUrl}/${urlParam}`
    });

    return { success: true, messageId: data?.messages?.[0]?.id, url: `${appBaseUrl}/${urlParam}` };
  } catch (error) {
    logger.error('Error in sendWhatsAppTemplateAction', { error: error instanceof Error ? error.message : 'Unknown error' });
    return { error: 'send_template failed' };
  }
}
