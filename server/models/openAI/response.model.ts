/**
 * @fileoverview OpenAI Response Model.
 *
 * Purpose:
 * - Generate review replies using OpenAI's Conversations + Responses API.
 * - Convert WhatsApp audio attachments to text via Whisper.
 *
 * Key exports:
 * - generateResponse: Builds structured replies for Google reviews.
 * - speechToText: Performs speech-to-text transcription for WhatsApp audio.
 *
 * @requires OPENAI_API_KEY environment variable
 */

import OpenAI from 'openai'
import { createLogger } from '@/lib/logger'
import { APP_CONSTANTS } from '@/lib/constants'

const logger = createLogger('OpenAIResponseModel')

// Interface for the OpenAI input
export interface OpenAIResponseInput {
    userResponse: string,
    promptContext: string,
    instructions: string,
    model?: string,
    temperature?: number,
    maxTokens?: number,
    responseFormat?: string,
    previousResponseId?: string,
}

// Interface for the OpenAI output
export interface OpenAIResponseOutput {
    response: string,
    model?: string,
    temperature?: number,
    maxTokens?: number,
    usage?: {
        promptTokens: number,
        completionTokens: number,
        totalTokens: number,
    }
}

/**
 * Generates an AI response using OpenAI's Conversations + Responses API.
 *
 * @param input - Configuration object with prompt context, user response, and instructions
 * @returns Promise<OpenAIResponseOutput> - Generated response with metadata
 * @throws Error if API key is missing or API request fails
 */
export async function generateResponse(
    input: OpenAIResponseInput
): Promise<OpenAIResponseOutput> {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
        logger.error('OPENAI_API_KEY is not configured')
        throw new Error('OPENAI_API_KEY is not configured in environment variables')
    }

    const model = input.model || APP_CONSTANTS.openAi.models.default
    const temperature = input.temperature ?? APP_CONSTANTS.openAi.request.defaultTemperature
    const maxTokens = input.maxTokens || APP_CONSTANTS.openAi.request.defaultMaxTokens
    const responseFormat = input.responseFormat || ''
    
    const systemContent = responseFormat 
        ? input.instructions + '\n\nYou MUST respond with valid JSON in this exact format: ' + responseFormat + '\n\nMake sure all property names are in double quotes.'
        : input.instructions
    
    const previousResponseContext = input.previousResponseId 
        ? `\n\nPrevious response ID: ${input.previousResponseId}\nUse this to maintain conversation context and continuity.`
        : ''
    
    const userMessage = `${input.promptContext}${previousResponseContext}\n\nUser's original response: ${input.userResponse}`

    try {
        const client = new OpenAI({ apiKey })
        const conversation = await client.conversations.create({
            items: [
                {
                    type: 'message',
                    role: 'developer',
                    content: 'Review response conversation initialized.'
                }
            ]
        })

        if (!conversation?.id) {
            logger.error('OpenAI did not return a conversation id')
            throw new Error('OpenAI did not return a conversation id')
        }

        type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
        type OutputContent = { type?: string; text?: string }
        type OutputItem = { type?: string; content?: OutputContent[] }
        type SDKResponse = {
            output_text?: string
            output?: OutputItem[]
            choices?: Array<{ message?: { content?: string } }>
            conversation?: { id?: string }
            model?: string
            usage?: Usage
        }

        const requestBody: unknown = {
            model,
            conversation: { id: conversation.id },
            instructions: systemContent,
            input: userMessage,
            temperature,
            max_output_tokens: maxTokens
        }

        const data = await (client.responses.create as unknown as (body: unknown) => Promise<SDKResponse>)(requestBody)

        let generatedResponse = ''
        if (typeof data.output_text === 'string' && data.output_text.length > 0) {
            generatedResponse = data.output_text
        } else if (Array.isArray(data.output)) {
            const messages = data.output.filter(o => o.type === 'message')
            const contents = messages.flatMap(m => m.content || [])
            const textParts = contents.filter(c => c.type === 'output_text' && typeof c.text === 'string').map(c => c.text as string)
            generatedResponse = textParts.join('\n').trim()
        } else if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
            generatedResponse = String(data.choices[0].message.content)
        }

        if (!generatedResponse) {
            logger.error('No response generated from OpenAI', { conversationId: conversation.id })
            throw new Error('OpenAI did not return a valid response')
        }

        return {
            response: generatedResponse.trim(),
            model: data.model || model,
            temperature,
            maxTokens,
            usage: data.usage
                ? {
                    promptTokens: data.usage.prompt_tokens || 0,
                    completionTokens: data.usage.completion_tokens || 0,
                    totalTokens: data.usage.total_tokens || 0,
                }
                : undefined
        }

    } catch (error) {
        logger.error('Error generating OpenAI response', { error })
        throw error
    }
}


export async function speechToText(audioUrl: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
        logger.error('OPENAI_API_KEY is not configured')
        throw new Error('OPENAI_API_KEY is not configured in environment variables')
    }
    
    // Download the audio file from WhatsApp with authorization
    const audioContent = await fetch(audioUrl, {
        headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
        }
    });
    
    if (!audioContent.ok) {
        logger.error('Failed to download audio from WhatsApp', {
            status: audioContent.status,
            statusText: audioContent.statusText
        });
        throw new Error('Failed to get audio content from WhatsApp');
    }
    
    const audioBlob = await audioContent.blob();
    const audioBuffer = await audioBlob.arrayBuffer();
    
    // Create FormData for multipart/form-data request
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: audioBlob.type || 'audio/ogg' });
    formData.append('file', blob, 'audio.ogg');
    formData.append('model', APP_CONSTANTS.openAi.models.whisper);
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`
        },
        body: formData
    })
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error('OpenAI transcription API request failed', {
            status: response.status,
            statusText: response.statusText,
            error: JSON.stringify(errorData)
        });
        throw new Error('Failed to convert audio to text')
    }
    
    const data = await response.json()
    return data.text
}