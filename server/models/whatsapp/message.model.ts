/**
 * WhatsApp Message Model
 * 
 * This module provides functionality for handling WhatsApp messages using WHATSAPP_ACCESS_TOKEN directly:
 * - Receiving incoming messages via webhook
 * - Sending outgoing messages
 * - Message validation and processing
 * - Message status tracking
 * - No OAuth2 token management - uses static access token from environment variables
 */

import { createLogger } from '@/lib/logger';
import { z } from 'zod';
import { APP_CONSTANTS } from '@/lib/constants';
import { previewString } from '@/lib/utils';

const logger = createLogger('WhatsAppMessageService');

// Webhook data types
interface WebhookEntry {
  changes: Array<{
    value: {
      messages?: Array<{
        id: string;
        from: string;
        timestamp: string;
        type: string;
        text?: { body: string };
        image?: { id: string; mime_type: string; sha256: string; caption?: string };
        audio?: { id: string; mime_type: string; sha256: string };
        video?: { id: string; mime_type: string; sha256: string; caption?: string };
        document?: { id: string; mime_type: string; sha256: string; filename?: string };
        location?: { latitude: number; longitude: number; name?: string; address?: string };
        contact?: { name: { formatted_name: string }; phones: Array<{ phone: string; type?: string }> };
        context?: { from: string; id: string };
      }>;
      statuses?: Array<{
        id: string;
        status: string;
        timestamp: string;
        recipient_id: string;
      }>;
      metadata: {
        phone_number_id: string;
      };
    };
  }>;
}

interface WebhookData {
  entry: WebhookEntry[];
}

// Message types and schemas
export const MessageType = z.enum(['text', 'image', 'audio', 'video', 'document', 'location', 'contact']);
export type MessageType = z.infer<typeof MessageType>;

export const MessageStatus = z.enum(['sent', 'delivered', 'read', 'failed']);
export type MessageStatus = z.infer<typeof MessageStatus>;

// Incoming message schema (from WhatsApp webhook)
export const IncomingMessageSchema = z.object({
  id: z.string(),
  from: z.string(), // phone number
  to: z.string(), // business phone number
  timestamp: z.string(),
  type: MessageType,
  text: z.object({
    body: z.string()
  }).optional(),
  image: z.object({
    id: z.string(),
    mime_type: z.string(),
    sha256: z.string(),
    caption: z.string().optional()
  }).optional(),
  audio: z.object({
    id: z.string(),
    mime_type: z.string(),
    sha256: z.string()
  }).optional(),
  video: z.object({
    id: z.string(),
    mime_type: z.string(),
    sha256: z.string(),
    caption: z.string().optional()
  }).optional(),
  document: z.object({
    id: z.string(),
    mime_type: z.string(),
    sha256: z.string(),
    filename: z.string().optional()
  }).optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    name: z.string().optional(),
    address: z.string().optional()
  }).optional(),
  // contacts is an array of objects with profile.name and wa_id
  contacts: z.array(z.object({
    profile: z.object({
      name: z.string()
    }),
    wa_id: z.string()
  }).optional()),
  context: z.object({
    from: z.string(),
    id: z.string()
  }).optional()
});

export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;

// Outgoing message schema
export const OutgoingMessageSchema = z.object({
  to: z.string(), // recipient phone number
  type: MessageType,
  text: z.object({
    body: z.string()
  }).optional(),
  image: z.object({
    link: z.string().optional(),
    id: z.string().optional(),
    caption: z.string().optional()
  }).optional(),
  audio: z.object({
    link: z.string().optional(),
    id: z.string().optional()
  }).optional(),
  video: z.object({
    link: z.string().optional(),
    id: z.string().optional(),
    caption: z.string().optional()
  }).optional(),
  document: z.object({
    link: z.string().optional(),
    id: z.string().optional(),
    filename: z.string().optional(),
    caption: z.string().optional()
  }).optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    name: z.string().optional(),
    address: z.string().optional()
  }).optional(),
  contact: z.object({
    name: z.object({
      formatted_name: z.string()
    }),
    phones: z.array(z.object({
      phone: z.string(),
      type: z.string().optional()
    }))
  }).optional()
});

export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>;

// Message response schema
export const MessageResponseSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  contacts: z.array(z.object({
    input: z.string(),
    wa_id: z.string()
  })),
  messages: z.array(z.object({
    id: z.string()
  }))
});

export type MessageResponse = z.infer<typeof MessageResponseSchema>;

// Message status update schema
export const MessageStatusUpdateSchema = z.object({
  id: z.string(),
  status: MessageStatus,
  timestamp: z.string(),
  recipient_id: z.string()
});

export type MessageStatusUpdate = z.infer<typeof MessageStatusUpdateSchema>;

/**
 * WhatsApp Message Service Class
 * Handles all WhatsApp message operations using static access token
 */
export class WhatsAppMessageService {
  private accessToken: string;
  private phoneNumberId: string;
  private apiVersion: string;

  constructor(
    accessToken: string, 
    phoneNumberId: string, 
    apiVersion: string = APP_CONSTANTS.whatsapp.api.legacyVersion
  ) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.apiVersion = apiVersion;
  }

  /**
   * Process incoming message from webhook
   * Validates and processes incoming WhatsApp messages
   */
  async processIncomingMessage(webhookData: WebhookData): Promise<IncomingMessage | null> {
    try {
      // Validate webhook data structure
      if (!webhookData.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        logger.debug('No message found in webhook data');
        return null;
      }

      const messageData = webhookData.entry[0].changes[0].value.messages[0];
      // const contacts = (webhookData as any).entry[0].changes[0].value.contacts?.[0];

      // Parse and validate message
      const message = IncomingMessageSchema.parse({
        id: messageData.id,
        from: messageData.from,
        to: webhookData.entry[0].changes[0].value.metadata.phone_number_id,
        timestamp: messageData.timestamp,
        type: messageData.type,
        text: messageData.text,
        image: messageData.image,
        audio: messageData.audio,
        video: messageData.video,
        document: messageData.document,
        location: messageData.location,
        contact: messageData.contact,
        context: messageData.context
      });

      logger.debug('Processed incoming message', {
        id: message.id,
        from: message.from,
        type: message.type,
        timestamp: message.timestamp
      });

      return message;
    } catch (error) {
      logger.error('Error processing incoming message', error);
      return null;
    }
  }

  /**
   * Send text message
   */
  async sendTextMessage(to: string, text: string, from?: string): Promise<MessageResponse | null> {
    const message: OutgoingMessage = {
      to,
      type: 'text',
      text: { body: text }
    };

    return this.sendMessage(message, from);
  }

  /**
   * Send image message
   */
  async sendImageMessage(to: string, imageUrl: string, caption?: string): Promise<MessageResponse | null> {
    const message: OutgoingMessage = {
      to,
      type: 'image',
      image: {
        link: imageUrl,
        caption
      }
    };

    return this.sendMessage(message);
  }

  /**
   * Send document message
   */
  async sendDocumentMessage(to: string, documentUrl: string, filename?: string, caption?: string): Promise<MessageResponse | null> {
    const message: OutgoingMessage = {
      to,
      type: 'document',
      document: {
        link: documentUrl,
        filename,
        caption
      }
    };

    return this.sendMessage(message);
  }

  /**
   * Send location message
   */
  async sendLocationMessage(to: string, latitude: number, longitude: number, name?: string, address?: string): Promise<MessageResponse | null> {
    const message: OutgoingMessage = {
      to,
      type: 'location',
      location: {
        latitude,
        longitude,
        name,
        address
      }
    };

    return this.sendMessage(message);
  }

  /**
   * Generic message sender using access token from environment
   */
  async sendMessage(message: OutgoingMessage, from?: string): Promise<MessageResponse | null> {
    try {
      // Validate message
      const validatedMessage = OutgoingMessageSchema.parse(message);

      // Send message using access token
      const response = await this.sendMessageWithToken(validatedMessage, this.accessToken, from);
      
      if (!response) {
        logger.error('Failed to send message', {
          message: validatedMessage,
          to: validatedMessage.to,
          type: validatedMessage.type
        });
        return null;
      }

      logger.debug('Message sent successfully:', {
        messageId: response.messages[0]?.id,
        to: validatedMessage.to,
        type: validatedMessage.type
      });

      return response;
    } catch (error) {
      logger.error('Error sending message:', error);
      return null;
    }
  }

  /**
   * Send message with specific token
   */
  private async sendMessageWithToken(message: OutgoingMessage, token: string, from?: string): Promise<MessageResponse | null> {
    try {
      const url = `${APP_CONSTANTS.whatsapp.api.baseUrl}/${this.apiVersion}/${from || this.phoneNumberId}/messages`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: message.to,
          type: message.type,
          [message.type]: message[message.type],
          text: message.text,
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        logger.error('Failed to send message', {
          message: message,
          tokenPreview: previewString(token, APP_CONSTANTS.whatsapp.logging.signaturePreviewLength),
          error: errorData.error.message
        });
        return null;
      }

      const responseData = await response.json();
      const validatedResponse = MessageResponseSchema.parse(responseData);

      return validatedResponse;
    } catch (error) {
      logger.error('Error sending message with token', error);
      return null;
    }
  }

  /**
   * Process message status updates
   */
  async processStatusUpdate(webhookData: WebhookData): Promise<MessageStatusUpdate | null> {
    try {
      if (!webhookData.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]) {
        return null;
      }

      const statusData = webhookData.entry[0].changes[0].value.statuses[0];

      const statusUpdate = MessageStatusUpdateSchema.parse({
        id: statusData.id,
        status: statusData.status,
        timestamp: statusData.timestamp,
        recipient_id: statusData.recipient_id
      });

      logger.debug('Message status update', {
        id: statusUpdate.id,
        status: statusUpdate.status,
        recipient: statusUpdate.recipient_id
      });

      return statusUpdate;
    } catch (error) {
      logger.error('Error processing status update', error);
      return null;
    }
  }

  /**
   * Verify webhook signature (for security)
   */
  async verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean> {
    const crypto = await import('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return signature === `sha256=${expectedSignature}`;
  }
}

/**
 * Utility functions for message handling
 */
export const MessageUtils = {
  /**
   * Extract phone number from WhatsApp ID
   */
  extractPhoneNumber(waId: string): string {
    return waId.replace('@c.us', '');
  },

  /**
   * Format phone number for WhatsApp
   */
  formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // Add country code if not present (assuming +1 for US)
    if (cleaned.length === 10) {
      return `1${cleaned}`;
    }
    
    return cleaned;
  },

  /**
   * Check if message is from business hours
   */
  isBusinessHours(timestamp: string): boolean {
    const date = new Date(parseInt(timestamp) * 1000);
    const hour = date.getHours();
    const day = date.getDay();
    
    // Monday to Friday, 9 AM to 6 PM
    return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
  },

  /**
   * Generate auto-reply message
   */
  generateAutoReply(messageType: MessageType, isBusinessHours: boolean): string {
    if (!isBusinessHours) {
      return "Thank you for your message. We're currently outside business hours (9 AM - 6 PM, Monday to Friday). We'll get back to you as soon as possible.";
    }

    switch (messageType) {
      case 'text':
        return "Thank you for your message. We'll respond shortly.";
      case 'image':
        return "Thank you for sharing the image. We'll review it and get back to you.";
      case 'document':
        return "Thank you for the document. We'll review it and respond accordingly.";
      default:
        return "Thank you for your message. We'll get back to you shortly.";
    }
  }
};

/**
 * Factory function to create WhatsApp service instance using environment variables
 */
export const createWhatsAppService = async (): Promise<WhatsAppMessageService> => {
  return new WhatsAppMessageService(
    process.env.WHATSAPP_ACCESS_TOKEN || '',
    process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    process.env.WHATSAPP_API_VERSION || APP_CONSTANTS.whatsapp.api.legacyVersion
  );
};

// Legacy factory for backward compatibility
export const whatsappMessageService = new WhatsAppMessageService(
  process.env.WHATSAPP_ACCESS_TOKEN || '',
  process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  process.env.WHATSAPP_API_VERSION || APP_CONSTANTS.whatsapp.api.legacyVersion
);
