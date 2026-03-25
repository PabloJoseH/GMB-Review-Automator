'use server';

import { sendWhatsAppTemplateAction } from './sendMessage.action';
import { createLogger } from '@/lib/logger';

const logger = createLogger('WHATSAPP_USER_MESSAGES');

/**
 * Send Sign In link via WhatsApp
 * Sends a template message with sign-in link to the user
 */
export async function sendSignInLinkMessage(userId: string, locale: string = 'es'): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const result = await sendWhatsAppTemplateAction(userId, {
      template_type: 'sign_in',
      locale,
      reauth: false
    });

    if ('error' in result) {
      logger.error('Failed to send sign-in template', {
        userId,
        error: result.error
      });
      return {
        success: false,
        error: result.error
      };
    }

    logger.debug('Sign-in template sent', {
      userId,
      messageId: result.messageId,
      url: result.url
    });

    return {
      success: true,
      message: 'Sign-in link message sent successfully'
    };
  } catch (error) {
    logger.error('Error sending sign-in link message', error, { userId });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Send Sign Up message via WhatsApp
 * Sends a template message with sign-up link to the user
 */
export async function sendSignUpMessage(userId: string, locale: string = 'es'): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const result = await sendWhatsAppTemplateAction(userId, {
      template_type: 'account_creation',
      locale,
      reauth: false
    });

    if ('error' in result) {
      logger.error('Failed to send sign-up template', {
        userId,
        error: result.error
      });
      return {
        success: false,
        error: result.error
      };
    }

    logger.debug('Sign-up template sent', {
      userId,
      messageId: result.messageId,
      url: result.url
    });

    return {
      success: true,
      message: 'Sign-up message sent successfully'
    };
  } catch (error) {
    logger.error('Error sending sign-up message', error, { userId });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Send Reauth message via WhatsApp
 * Sends a template message with reauth link to the user
 */
export async function sendReauthMessage(userId: string, locale: string = 'es'): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const result = await sendWhatsAppTemplateAction(userId, {
      template_type: 'account_creation',
      locale,
      reauth: true
    });

    if ('error' in result) {
      logger.error('Failed to send reauth template', {
        userId,
        error: result.error
      });
      return {
        success: false,
        error: result.error
      };
    }

    logger.debug('Reauth template sent', {
      userId,
      messageId: result.messageId,
      url: result.url
    });

    return {
      success: true,
      message: 'Reauth message sent successfully'
    };
  } catch (error) {
    logger.error('Error sending reauth message', error, { userId });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Send Proposed Responses message via WhatsApp
 * Sends a template message with link to proposed responses page
 */
export async function sendProposedResponsesMessage(userId: string, locale: string = 'es'): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const result = await sendWhatsAppTemplateAction(userId, {
      template_type: 'proposed_responses',
      locale
    });

    if ('error' in result) {
      logger.error('Failed to send proposed responses template', {
        userId,
        error: result.error
      });
      return {
        success: false,
        error: result.error
      };
    }

    logger.debug('Proposed responses template sent', {
      userId,
      messageId: result.messageId,
      url: result.url
    });

    return {
      success: true,
      message: 'Proposed responses message sent successfully'
    };
  } catch (error) {
    logger.error('Error sending proposed responses message', error, { userId });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

