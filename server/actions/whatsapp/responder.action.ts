/**
 * WhatsApp Responder Action
 * 
 * This function handles incoming WhatsApp messages and provides AI-powered responses:
 * - Uses enqueueByWaId to prevent concurrent processing for the same WhatsApp ID
 * - All processing is queued: checks if user exists by phone number, creates user and session if needed,
 *   prepares incoming message content (downloads and processes audio/images/documents), generates AI response,
 *   sends response via WhatsApp, and saves messages to database
 * - Saves incoming message (supports text, audio, images, documents)
 * - Generates AI response using OpenAI with conversation history and function calling
 * - Implements a loop that continues until AI returns a normal text response (not a function call)
 * - Executes function calls and feeds results back to OpenAI until final response is ready
 * - Available functions: web_search, query_client_data, query_locations_data, query_sample_reviews_data, 
 *   get_google_reviews, update_prompt_context, send_login_template
 * - Saves AI response and updates session
 * - OpenAI client configured with 5-minute timeout to support web search operations
 * - Route handler configured with maxDuration of 300 seconds for extended operations
 */

'use server';

import { WhatsAppMessageService, MessageUtils, type IncomingMessage } from '../../models/whatsapp/message.model';
import { createLogger } from '@/lib/logger';
import { UsersModel } from '@/server/models/supabase/users.model';
import { MessagesModel } from '@/server/models/supabase/messages.model';
import { speechToText } from '@/server/models/openAI/response.model';
import { OpenAIConversations } from '@/server/models/openAI/conversation.model';
import { messages, users, sessions } from '@/app/generated/prisma';
import { sendTypingIndicatorAction } from './sendMessage.action';
import { SessionsModel } from '@/server/models/supabase/sessions.model';
import { GlobalConfigModel } from '@/server/models/supabase/global-config.model';
import { enqueueByWaId, generateAIResponse, sendDeveloperMessage as sendDeveloperMessageImpl, summarizeMessages } from '@/server/models/openAI/conversation.model';
import { saveMessageContentToStorage } from '@/server/models/supabase/assets.model';
import { checkWhatsAppMessageExists } from '@/server/actions/supabase/messages.action';
import { APP_CONSTANTS } from '@/lib/constants';

// Only async exports are allowed in a "use server" file; provide async proxy
export async function sendDeveloperMessage(
  developerMessage: string,
  waid: string
): Promise<{ success: boolean; error?: string; messageId?: string; reply?: string; needs_action?: boolean }> {
  return await sendDeveloperMessageImpl(developerMessage, waid);
}

const logger = createLogger('WhatsAppResponderAction');

const whatsappService = new WhatsAppMessageService(
  process.env.WHATSAPP_ACCESS_TOKEN || '',
  process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  process.env.WHATSAPP_API_VERSION || APP_CONSTANTS.whatsapp.api.defaultVersion,
);

// Get global configuration from GlobalConfigModel
const globalConfiguration = await GlobalConfigModel.findActive();

// AVAILABLE_FUNCTIONS now imported from tools model

interface WhatsAppOnboardingResult {
  success: boolean;
  messageId?: string;
  userId?: string;
  sessionId?: string;
  error?: string;
}

/**
 * Main onboarding function that processes WhatsApp messages
 * @param webhookMessage - The incoming WhatsApp message from webhook
 * @returns Promise<WhatsAppOnboardingResult>
 */
export async function processWhatsAppMessage(
  webhookMessage: IncomingMessage
): Promise<WhatsAppOnboardingResult> {
  try {
    logger.debug('Processing WhatsApp onboarding message', {
      messageId: webhookMessage.id,
      from: webhookMessage.from,
      type: webhookMessage.type
    });

    // Check if message was already processed
    const messageCheck = await checkWhatsAppMessageExists(webhookMessage.id);
    if (messageCheck.exists) {
      logger.debug('WhatsApp message already processed, skipping', {
        messageId: webhookMessage.id,
        from: webhookMessage.from
      });
      return {
        success: true,
        messageId: webhookMessage.id,
        error: 'Message already processed'
      };
    }

    // Extract phone number from WhatsApp ID
    const phoneNumber = MessageUtils.extractPhoneNumber(webhookMessage.from);
    const formattedPhoneNumber = MessageUtils.formatPhoneNumber(phoneNumber);

    // Enqueue entire processing flow to prevent concurrent processing for the same wa_id
    // This includes: getting/creating user+session, preparing message content, generating AI response,
    // sending WhatsApp message, and saving messages to database
    return await enqueueByWaId(formattedPhoneNumber, async () => {
      // Step 1: get user+session
      let userData = await UsersModel.findUserByWaId(formattedPhoneNumber);

      let session;
      let userId: string;
      let sessionId: string;

      if (!userData || !userData.id || !userData.sessions) {
        // Step 2: create new user and session with users model
        logger.debug('Creating new user and session', { phoneNumber: formattedPhoneNumber });
        const result = await UsersModel.createUser({
          username: webhookMessage.contacts?.[0]?.profile?.name || '', // get username from whatsapp user name contacts[0].profile.name
          wa_id: webhookMessage.contacts?.[0]?.wa_id || '',
          role: 'USER',
          onboarding_status: 'user'
        });
        if (!result) {
          logger.error('Error creating new user and session', { error: 'Error creating new user and session' });
          throw new Error('Error creating new user and session');
        }
        const user = result.user;
        userId = user.id;
        sessionId = result.session.id;
        // Fetch userData with all includes after creating the user
        userData = await UsersModel.findUserByWaId(formattedPhoneNumber);
        if (!userData || !userData.sessions) {
          logger.error('Error fetching userData after creation', { error: 'Error fetching userData after creation' });
          throw new Error('Error fetching userData after creation');
        }
        session = userData.sessions[0];
        logger.debug('Created new user and session', {
          userId: user.id,
          sessionId: session.id,
          waId: user.wa_id
        });
      } else {
        userId = userData.id;
        session = userData.sessions[0];
        sessionId = session.id;
        logger.debug('Found user and session', {
          userId: userId,
          sessionId: session.id,
          waId: userData.wa_id
        });
      }
      // Send typing indicator to show user we're processing their message
      if (session.agent_managed) {
        sendTypingIndicatorAction(webhookMessage.from, webhookMessage.id);
      }
      // Ensure the session has a conversation_id for OpenAI
      if (!session?.conversation_id) {
        const newConversationId = await OpenAIConversations.createConversation();
        await SessionsModel.updateSession(sessionId, { 
          conversation_id: newConversationId,
          user_id: session.user_id,
          agent_managed: session.agent_managed
        });
        // update local session reference
        session = { ...session, conversation_id: newConversationId } as sessions;
        logger.debug('Created OpenAI conversation for session', { sessionId, conversationId: newConversationId });
      }
      
      // Step 3: Prepare incoming message data (download content if needed)
      let userMessageContent: string;
      let imageOrDocumentContent: string | undefined = undefined;
      let messageAssetData: { url: string; source: string; mime_type: string; size: bigint | null } | undefined = undefined;

      if (webhookMessage.type === 'image' || webhookMessage.type === 'audio' || webhookMessage.type === 'document') {
        try {
          const phoneNumberId =
            webhookMessage.to ||
            globalConfiguration?.whatsapp_phone_number_id ||
            process.env.WHATSAPP_PHONE_NUMBER_ID ||
            '';
          if (!phoneNumberId) {
            logger.error('Missing phone_number_id for media message', {
              messageId: webhookMessage.id,
              from: webhookMessage.from,
              to: webhookMessage.to,
              configPhoneNumberId: globalConfiguration?.whatsapp_phone_number_id
            });
            throw new Error('Missing phone_number_id for media message');
          }

          const messageContent = await getMessageContent(webhookMessage, phoneNumberId);
          if (!messageContent || !messageContent.mime_type) {
            logger.error('No message content or mime_type returned from WhatsApp for media message', {
              messageId: webhookMessage.id,
              from: webhookMessage.from,
              type: webhookMessage.type
            });
            throw new Error('No message content found');
          }

          if (webhookMessage.type === 'audio') {
            // Convert WhatsApp audio to text using OpenAI Whisper
            const audioText = await speechToText(messageContent.url);
            if (!audioText) {
              logger.error('Audio transcription returned empty text', {
                messageId: webhookMessage.id,
                mediaId: messageContent.id
              });
              throw new Error('Failed to convert audio to text');
            }
            userMessageContent = audioText;
          } else {
            // Download the image or document, upload to Supabase Storage and get the URL
            const assetUrl = await saveMessageContentToStorage(messageContent);

            userMessageContent = extractMessageContent(webhookMessage);

            messageAssetData = {
              url: assetUrl,
              source: webhookMessage.type,
              mime_type: messageContent.mime_type,
              size: messageContent.file_size ? BigInt(messageContent.file_size) : null
            };

            // Set the image/document URL to pass to OpenAI
            imageOrDocumentContent = assetUrl;
          }
        } catch (mediaError) {
          logger.error('Error processing incoming media message; falling back to text-only handling', {
            error: mediaError instanceof Error ? mediaError.message : 'Unknown error',
            messageId: webhookMessage.id,
            from: webhookMessage.from,
            type: webhookMessage.type
          });
          // Fallback: ignore media and continue with textual representation only
          userMessageContent = extractMessageContent(webhookMessage);
          imageOrDocumentContent = undefined;
          messageAssetData = undefined;
        }
      } else {
        userMessageContent = extractMessageContent(webhookMessage);
      }

      // Step 4: Generate AI response and send via WhatsApp (only if agent_managed)
      if (session.agent_managed) {
        // Extract active localizations IDs from userData
        const activeLocalizationsIds = userData?.locations_locations_created_byTousers?.map(loc => loc.id) || [];
        
        const tokensThreshold = globalConfiguration?.threshold_tokens || 1000;
        let activeSession = session as sessions;
        let activeSessionId = sessionId;
        let aiResponse = await generateAIResponse(
          userMessageContent,
          userData as users,
          activeSession,
          imageOrDocumentContent,
          activeLocalizationsIds
        );
        const hasFunctionCalls = Boolean(aiResponse.executedFunctionCalls && aiResponse.executedFunctionCalls.length > 0);

        if (!hasFunctionCalls && aiResponse.usage?.totalTokens && aiResponse.usage.totalTokens > tokensThreshold) {
          // Get model and maxTokens from global configuration to summarize and restart the conversation
          let model = 'gpt-4o-mini';
          let maxTokens = 1000;
          if (globalConfiguration) {
            if (globalConfiguration.onboarding_model) {
              model = globalConfiguration.onboarding_model as string;
            }
            if (globalConfiguration.onboarding_max_tokens) {
              maxTokens = globalConfiguration.onboarding_max_tokens as number;
            }
          }

          const previousSessionId = activeSessionId;
          const previousConversationId = activeSession.conversation_id as string;

          // Summarize the conversation before restarting
          const summary = await summarizeMessages(previousConversationId, model, maxTokens * 3);
          await SessionsModel.updateSession(previousSessionId, { summary });

          const recentDialogMessages = await MessagesModel.findRecentDialogMessages(
            previousSessionId,
            APP_CONSTANTS.whatsapp.message.recentDialogMessagesLimit
          );

          const seededConversationMessages = [
            { role: 'developer', content: summary },
            ...recentDialogMessages.map(dialogMessage => ({
              role: dialogMessage.role === 'user' ? 'user' : 'assistant',
              content: dialogMessage.content || ''
            })),
            { role: 'system', content: APP_CONSTANTS.whatsapp.message.summarySystemMessage }
          ];

          const newConversationId = await OpenAIConversations.createConversation(seededConversationMessages);

          // Persist the new session and reuse it for the regenerated response
          const newSession = await SessionsModel.createSession({
            user_id: userId,
            conversation_id: newConversationId,
            agent_managed: true,
            tokens: 0
          });

          activeSession = newSession as sessions;
          activeSessionId = newSession.id;

          logger.debug('Conversation restarted with summary', {
            userId,
            previousSessionId,
            newSessionId: activeSessionId,
            newConversationId,
            summary,
            recentDialogMessagesCount: recentDialogMessages.length
          });

          aiResponse = await generateAIResponse(
            userMessageContent,
            userData as users,
            activeSession,
            imageOrDocumentContent,
            activeLocalizationsIds
          );

          if (aiResponse.usage?.totalTokens && aiResponse.usage.totalTokens > tokensThreshold) {
        logger.debug('Regenerated response still exceeds token threshold after session restart', {
          sessionId: activeSessionId,
          userId,
          totalTokens: aiResponse.usage?.totalTokens,
          threshold: tokensThreshold
        });
          }
        } else if (aiResponse.usage?.totalTokens && aiResponse.usage.totalTokens > tokensThreshold) {
          logger.debug('Tokens exceeded threshold but summary skipped due to function call usage', {
            sessionId: activeSessionId,
            userId,
            executedFunctionCalls: aiResponse.executedFunctionCalls?.length || 0,
            totalTokens: aiResponse.usage?.totalTokens,
            threshold: tokensThreshold
          });
        }
        
        // Send message via WhatsApp
        const whatsappResponse = await whatsappService.sendTextMessage(
          webhookMessage.from,
          aiResponse.response,
          process.env.WHATSAPP_PHONE_NUMBER_ID || undefined
        );

        if (!whatsappResponse) {
          logger.error('Failed to send WhatsApp response', {
            to: webhookMessage.from,
            content: aiResponse.response
          });
          throw new Error('Failed to send WhatsApp response');
        } 

        logger.debug('Successfully sent WhatsApp response', {
          whatsappMessageId: whatsappResponse.messages[0]?.id,
          to: webhookMessage.from,
          userId,
          sessionId: activeSessionId
        });

        // Step 5: Save messages in batch after successful WhatsApp send
        // Order: user → function_calls (if any) → agent
        const messagesToSave: Array<Omit<messages, 'id' | 'created_at' | 'updated_at' | 'position'>> = [
          {
            session_id: activeSessionId,
            role: 'user',
            content: userMessageContent,
            whatsapp_message_id: webhookMessage.id,
          },
        ];

        // Add function calls if any were executed
        const functionCallMessages = (aiResponse.executedFunctionCalls || []).map(fc => ({
          session_id: activeSessionId,
          role: 'function_call' as const,
          content: JSON.stringify({ name: fc.name, arguments: fc.arguments }, null, 2),
          whatsapp_message_id: null,
        }));

        messagesToSave.push(...functionCallMessages);

        // Add agent response
        messagesToSave.push({
          session_id: activeSessionId,
          role: 'agent',
          content: aiResponse.response,
          whatsapp_message_id: null,
        });

        // Prepare assets array: user (may have asset) → function calls (null each) → agent (null)
        const assetsArray = messageAssetData
          ? [
              messageAssetData, // user message (index 0 in messagesToSave)
              ...Array(functionCallMessages.length).fill(null), // function calls
              null // agent response
            ]
          : undefined;

        const savedMessages = await MessagesModel.createMessagesBatch(aiResponse.tokens || 0, messagesToSave, assetsArray);

        logger.debug('Saved messages in batch', {
          userMessageId: savedMessages[0].id,
          functionCallsCount: functionCallMessages.length,
          aiResponseId: savedMessages[savedMessages.length - 1].id,
          sessionId: activeSessionId,
        });

        return {
          success: true,
          messageId: whatsappResponse.messages[0]?.id,
          userId,
          sessionId: activeSessionId
        };
      } else {
        // For non-agent-managed sessions, save user message only
        let incomingMessage: messages;
        if (messageAssetData) {
          incomingMessage = await MessagesModel.createMessage({
            session_id: sessionId,
            role: 'user',
            content: userMessageContent,
            whatsapp_message_id: webhookMessage.id,
          }, messageAssetData);
        } else {
          incomingMessage = await MessagesModel.createMessage({
            session_id: sessionId,
            role: 'user',
            content: userMessageContent,
            whatsapp_message_id: webhookMessage.id,
          });
        }

        logger.debug('Saved user message (non-agent-managed session)', {
          userMessageId: incomingMessage.id,
          sessionId: sessionId,
        });

        return {
          success: true,
          messageId: 'no_agent_managed',
          userId,
          sessionId: sessionId
        };
      }
    });

  } catch (error) {
    logger.error('Error processing WhatsApp onboarding message', {
      error: error instanceof Error ? error.message : 'Unknown error',
      messageId: webhookMessage.id,
      from: webhookMessage.from
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Extract message content based on message type
 */
function extractMessageContent(message: IncomingMessage): string {
  switch (message.type) {
    case 'text':
      return message.text?.body || '';
    case 'image':
      return `[Image] ${message.image?.caption || 'No caption'}`;
    case 'audio':
      return '[Audio message]';
    case 'video':
      return `[Video] ${message.video?.caption || 'No caption'}`;
    case 'document':
      return `[Document] ${message.document?.filename || 'No filename'}`;
    case 'location':
      return `[Location] ${message.location?.name || 'Shared location'}`;
    case 'contact':
      return `[Contact] ${message.contacts?.[0]?.profile?.name || 'Shared contact'}`;
    default:
      return '[Unknown message type]';
  }
}

// Conversation API keeps history by conversation_id; no need to fetch last messages


// Tool handlers and executeFunction moved to tools model

interface MessageContentType {
  id: string;
  url: string;
  mime_type?: string;
  file_size?: number;
}

/**
 * Fetches media URL and metadata from WhatsApp Cloud API.
 * Uses GET without phone_number_id (optional per Meta docs) to avoid 400 when the ID is invalid or missing.
 */
async function getMessageContent(message: IncomingMessage, _phoneNumberId: string): Promise<MessageContentType> {
  const messageId = message.audio?.id || message.image?.id || message.document?.id || '';
  if (!messageId) {
    throw new Error('No message id found');
  }

  const url = `${APP_CONSTANTS.whatsapp.api.baseUrl}/${APP_CONSTANTS.whatsapp.api.defaultVersion}/${messageId}`;
  const headers = { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` };

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to get message content', {
      status: response.status,
      statusText: response.statusText,
      error: errorText || 'Unknown error'
    });
    throw new Error('Failed to get message content');
  }

  const data = await response.json();
  return data;
}

// saveMessageContentToStorage moved to AssetsModel

/**
 * Send Developer Message
 * 
 * Sends a developer message via OpenAI (without tools), waits for response,
 * sends it via WhatsApp, and saves both messages to Supabase.
 * 
 * @param developerMessage - The developer message content
 * @param waid - WhatsApp ID to send the response to (format: 34XXXXXXXXX)
 * @returns Promise with success status and message IDs
 */
// sendDeveloperMessage is now exported from conversation.model.ts