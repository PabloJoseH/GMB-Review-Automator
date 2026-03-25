import { createLogger } from '@/lib/logger'
import OpenAI from 'openai'
import { GlobalConfigModel } from '@/server/models/supabase/global-config.model'
import { APP_CONSTANTS } from '@/lib/constants'
import { previewString } from '@/lib/utils'
import { AVAILABLE_FUNCTIONS, executeFunction } from '@/server/models/openAI/tool.model'
import { SessionsModel } from '@/server/models/supabase/sessions.model'
import { users, sessions, messages } from '@/app/generated/prisma'
import { MessagesModel } from '@/server/models/supabase/messages.model'
import { UsersModel } from '@/server/models/supabase/users.model'
import { LocationsModel } from '@/server/models/supabase/locations.model'
import { WhatsAppMessageService, MessageUtils } from '@/server/models/whatsapp/message.model'
import { ResponseInputItem } from 'openai/resources/responses/responses.mjs'
import { safeCall, type GlobalRateLimitState } from '@/lib/api-helpers'

/**
 * Overview
 * - Provides helpers to create and interact with OpenAI Conversations using the Responses API.
 * - Exposes two main functions:
 *   - createConversation: initializes and returns an OpenAI conversation id.
 *   - sendWithConversation: sends user input bound to a conversation with optional system instructions,
 *     tools (function calling), and image URL, and returns text, optional function call, usage, and model.
 * - Includes robust parsing for outputs across different SDK response shapes, including function calls
 *   emitted as `output` items of type `function_call` per the newer Responses API.
 * - OpenAI client is configured with a 5-minute timeout to support web search operations
 *   that may require additional time to complete.
 */

const logger = createLogger('OpenAIConversations')
// Configure client with extended timeout for web search operations
const client = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: APP_CONSTANTS.openAi.request.clientTimeout
})

/**
 * Transforms OpenAI SDK errors to be compatible with safeCall rate limit detection
 * Detects rate limit errors (429) from OpenAI API and transforms them to have status: 429
 * @param error - Error thrown by OpenAI SDK
 * @returns Transformed error with status: 429 if it's a rate limit error, otherwise original error
 */
function transformOpenAIError(error: unknown): Error {
  const errorObj = error as {
    status?: number
    statusCode?: number
    error?: { error?: string; message?: string }
    message?: string
    [key: string]: unknown
  }
  
  // Check if this is a rate limit error (429) from OpenAI
  const errorMessage = errorObj.error?.error || errorObj.error?.message || errorObj.message || ''
  const isRateLimit = 
    errorObj.status === 429 ||
    errorObj.statusCode === 429 ||
    (typeof errorMessage === 'string' && (
      errorMessage.includes('429') ||
      errorMessage.includes('Rate limit') ||
      errorMessage.includes('rate limit')
    ))
  
  if (isRateLimit) {
    // Transform error to have status: 429 for safeCall to detect
    const rateLimitError = new Error(errorMessage || 'Rate limit error (429)')
    ;(rateLimitError as { status?: number }).status = 429
    ;(rateLimitError as { statusCode?: number }).statusCode = 429
    return rateLimitError
  }
  
  // Return original error as Error instance
  if (error instanceof Error) {
    return error
  }
  
  return new Error(String(error))
}

const ERROR_RECENT_DIALOG_MESSAGES_LIMIT = APP_CONSTANTS.openAi.errorRecovery.recentDialogMessagesLimit
const ERROR_SYSTEM_MESSAGE = 'La respuesta de este turno no es importante y responde "si".'

/**
 * Model configuration type
 */
type ModelConfig = {
  reasoningEffort: 'minimal' | 'medium' | 'high'
  textVerbosity: 'low' | 'medium' | 'high'
} | null

/**
 * Detects the model family and returns its specific configuration
 * Returns null for models that don't require special parameters (e.g., GPT-4)
 * Checks models in order of specificity (more specific patterns first)
 */
function getModelConfig(model: string): ModelConfig {
  const modelLower = model.toLowerCase()
  
  // Check GPT-5.1 first (more specific pattern)
  if (modelLower.includes(APP_CONSTANTS.openAi.modelConfigs.gpt51.detectionPattern)) {
    return {
      reasoningEffort: APP_CONSTANTS.openAi.modelConfigs.gpt51.reasoningEffort as 'minimal' | 'medium' | 'high',
      textVerbosity: APP_CONSTANTS.openAi.modelConfigs.gpt51.textVerbosity as 'low' | 'medium' | 'high',
    }
  }
  
  // Check GPT-5 (general pattern)
  if (modelLower.includes(APP_CONSTANTS.openAi.modelConfigs.gpt5.detectionPattern)) {
    return {
      reasoningEffort: APP_CONSTANTS.openAi.modelConfigs.gpt5.reasoningEffort as 'minimal' | 'medium' | 'high',
      textVerbosity: APP_CONSTANTS.openAi.modelConfigs.gpt5.textVerbosity as 'low' | 'medium' | 'high',
    }
  }
  
  // No special configuration needed for other models
  return null
}

// Global configuration cache for responder/onboarding operations
let globalConfiguration = await GlobalConfigModel.findActive()
let lastGlobalConfigurationUpdate = Date.now()
// Refresh interval for reloading global configuration
const REFRESH_INTERVAL_MS = process.env.NODE_ENV === 'production' 
  ? APP_CONSTANTS.openAi.cache.refreshIntervalMs.production 
  : APP_CONSTANTS.openAi.cache.refreshIntervalMs.development

// WhatsApp service (used by sendDeveloperMessage helper)
const whatsappService = new WhatsAppMessageService(
  process.env.WHATSAPP_ACCESS_TOKEN || '',
  process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  process.env.WHATSAPP_API_VERSION || 'v24.0'
)

// Queue system to prevent concurrent OpenAI API calls per wa_id
interface QueuedTask<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}
const waIdQueues = new Map<string, QueuedTask<unknown>[]>()

export interface FunctionCall {
  name: string
  arguments: string
  callId?: string
}

export interface FunctionCallResult {
  functionCall?: FunctionCall
  response: string,
  tokens: number,
  developer_message?: string
  functionResult?: unknown
  executedFunctionCalls?: Array<{ name: string; arguments: string }>
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  previousResponseId?: string
  model?: string
  summary?: string
}

// Enqueue to serialize model calls per wa_id
export async function enqueueByWaId<T>(waId: string, taskFn: () => Promise<T>): Promise<T> {
  return new Promise<T>(async (resolve, reject) => {
    if (!waIdQueues.has(waId)) {
      waIdQueues.set(waId, [])
    }
    const queue = waIdQueues.get(waId)!
    const waitForPrevious = queue.length > 0 ? queue[queue.length - 1].promise : Promise.resolve()
    const taskPromise = waitForPrevious.then(async () => await taskFn())
    queue.push({
      promise: taskPromise as Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject: reject as (error: Error) => void
    })
    taskPromise
      .then(result => {
        const currentQueue = waIdQueues.get(waId)
        if (currentQueue && currentQueue.length > 0) currentQueue.shift()
        if (currentQueue && currentQueue.length === 0) waIdQueues.delete(waId)
        resolve(result)
      })
      .catch(error => {
        const currentQueue = waIdQueues.get(waId)
        if (currentQueue && currentQueue.length > 0) currentQueue.shift()
        if (currentQueue && currentQueue.length === 0) waIdQueues.delete(waId)
        reject(error)
      })
  })
}

export interface ToolDefinition {
  type?: string
  name?: string
  description?: string
  parameters?: Record<string, unknown>
}

export interface SendWithConversationInput {
  conversationId: string
  userText: string
  systemInstructions: string
  developer_message?: string
  model?: string
  maxTokens?: number
  imageUrl?: string
  tools?: ToolDefinition[]
  // Optional tool outputs to feed back results for prior function calls
  toolOutputs?: Array<{ callId: string; output: unknown }>
}

export interface ConversationFunctionCall {
  name: string
  arguments: string
  callId?: string
}

export interface SendWithConversationOutput {
  response: string
  functionCall?: ConversationFunctionCall
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  model?: string
}

export const OpenAIConversations = {
  // Creates a conversation by making an initial responses.create call and returning its conversation.id
  createConversation: async ( messages?: {role: string, content: string}[] ): Promise<string> => {
    if (!process.env.OPENAI_API_KEY) {
      logger.error('OPENAI_API_KEY is not configured')
      throw new Error('OPENAI_API_KEY is not configured in environment variables')
    }

    const items = messages ? messages.map(m => ({ type: 'message', role: m.role, content: m.content })) : [
      { type: 'message', role: 'developer', content: 'Conversation initialized. No prior user messages.' }
    ]

    const conversation = await client.conversations.create({
      items: items as ResponseInputItem[]
    })

    if (!conversation?.id) {
      throw new Error('OpenAI did not return a conversation id')
    }
    return conversation.id
  },

  // Sends a message bound to a conversation id, with optional system instructions, tools and image
  sendWithConversation: async (input: SendWithConversationInput): Promise<SendWithConversationOutput> => {
    if (!process.env.OPENAI_API_KEY) {
      logger.error('OPENAI_API_KEY is not configured')
      throw new Error('OPENAI_API_KEY is not configured in environment variables')
    }

    const model = input.model || APP_CONSTANTS.openAi.models.default
    const maxTokens = input.maxTokens || APP_CONSTANTS.openAi.request.defaultMaxTokens

    // Build input array with optional multimodal user content.
    const inputItems: Array<{ type: string; role?: string; content?: unknown }> = []
    
    if (input.developer_message) {
      inputItems.push({
        type: 'message',
        role: 'developer',
        content: input.developer_message
      })
    }
    
    const userText = input.userText
    const userContentParts: Array<{ type: string; text?: string; image_url?: string }> = [
      {
        type: 'input_text',
        text: userText
      }
    ]

    if (input.imageUrl) {
      userContentParts.push({
        type: 'input_image',
        image_url: input.imageUrl
      })
    }

    inputItems.push({
      type: 'message',
      role: 'user',
      content: userContentParts
    })

    const tools = (input.tools || []).map(t => {
      if (t.type === 'web_search') {
        return { type: 'web_search' as const }
      }
      return {
        type: 'function' as const,
        name: t.name!,
        description: t.description!,
        parameters: t.parameters!
      }
    })

    type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    type OutputContent = { type?: string; text?: string }
    type OutputItem = {
      // Generic output item typing that covers both message content and tool/function calls
      type?: string
      content?: OutputContent[]
      // Function call specific fields (Responses API emits items with type === 'function_call')
      name?: string
      arguments?: unknown
      call_id?: string
      // Some SDK shapes may include a nested tool object
      tool?: { type?: 'function'; name?: string; arguments?: unknown }
    }
    // We send input as a plain string (the SDK array shape requires item references)
    type ToolCall = { type?: 'function'; function?: { name?: string; arguments?: unknown } }
    type SDKResponse = {
      output_text?: string
      output?: OutputItem[]
      choices?: Array<{ message?: { content?: string; tool_calls?: ToolCall[] } }>
      conversation?: { id?: string }
      model?: string
      usage?: Usage
      tool_calls?: ToolCall[]
    }

    // Tool outputs are sent via the official tool_outputs field below

    // The Responses API accepts either a string or an array of typed input items; cast to satisfy SDK typing.
    const modelConfig = getModelConfig(model)
    const requestBody = {
      model,
      conversation: { id: input.conversationId },
      instructions: input.systemInstructions,
      input: input.developer_message || input.imageUrl ? inputItems : userText,
      max_output_tokens: maxTokens,
      ...(tools.length > 0 ? { tools, tool_choice: 'auto' as const, parallel_tool_calls: APP_CONSTANTS.openAi.functionCalling.parallelToolCalls } : {}),
      ...(modelConfig ? { reasoning: { effort: modelConfig.reasoningEffort }, text: { verbosity: modelConfig.textVerbosity } } : {})
    }
    const data = await (client.responses.create as unknown as (body: unknown) => Promise<unknown>)(requestBody) as unknown as SDKResponse
    // logger to see all the keys of the data and the keys of the data.choices[0]
    logger.debug('OpenAI response data', { keys: Object.keys(data), choicesKeys: Object.keys(data.output?.[0] || {}) });
    // Extract text
    let textResponse = ''
    if (typeof data.output_text === 'string' && data.output_text.length > 0) {
      textResponse = data.output_text
    } else if (Array.isArray(data.output)) {
      const messages = data.output.filter(o => o.type === 'message')
      const contents = messages.flatMap(m => m.content || [])
      const textParts = contents.filter(c => c.type === 'output_text' && typeof c.text === 'string').map(c => c.text as string)
      textResponse = textParts.join('\n').trim()
    } else if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
      textResponse = String(data.choices[0].message.content)
    }

    // Extract function call
    let functionCall: ConversationFunctionCall | undefined

    // Prefer Responses API `output` items of type 'function_call'
    if (Array.isArray(data.output)) {
      const fnItem = data.output.find(o => o?.type === 'function_call') as
        | (OutputItem & { type: 'function_call' })
        | undefined
      if (fnItem && (fnItem.name || fnItem.tool?.name)) {
        logger.debug('OpenAI function call', { fnItem });
        const rawArgs = fnItem.arguments ?? fnItem.tool?.arguments ?? {}
        functionCall = {
          name: (fnItem.name ?? fnItem.tool?.name ?? '') as string,
          arguments: typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs),
          callId: fnItem.call_id
        }
      }
    }

    // Fallback to legacy tool_calls arrays on top-level or choices
    if (!functionCall) {
      const toolCalls = data.tool_calls || data.choices?.[0]?.message?.tool_calls || []
      const candidate = Array.isArray(toolCalls) ? toolCalls[0] : undefined
      if (candidate && candidate.type === 'function') {
        const args = candidate.function?.arguments
        functionCall = {
          name: candidate.function?.name || '',
          arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {})
        }
      }
    }

    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0,
        }
      : undefined

    return {
      response: textResponse || '',
      functionCall,
      usage,
      model: data.model
    }
  }
  ,
  /**
   * Sends tool/function call output to an existing conversation thread using tool_outputs.
   * Use this immediately after the model requests a function call.
   */
  respondWithToolOutput: async (input: {
    conversationId: string
    systemInstructions: string
    developer_message?: string
    model?: string
    maxTokens?: number
    toolCallId: string
    output: unknown
    tools?: ToolDefinition[]
  }): Promise<SendWithConversationOutput> => {
    if (!process.env.OPENAI_API_KEY) {
      logger.error('OPENAI_API_KEY is not configured')
      throw new Error('OPENAI_API_KEY is not configured in environment variables')
    }

    const model = input.model || APP_CONSTANTS.openAi.models.default
    const maxTokens = input.maxTokens || APP_CONSTANTS.openAi.request.defaultMaxTokens

    // No plain string items when using array input; we will send only the function_call_output item

    type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    type OutputContent = { type?: string; text?: string }
    type OutputItem = {
      type?: string
      content?: OutputContent[]
      name?: string
      arguments?: unknown
      call_id?: string
      tool?: { type?: 'function'; name?: string; arguments?: unknown }
    }
    type ToolCall = { type?: 'function'; function?: { name?: string; arguments?: unknown } }
    type SDKResponse = {
      output_text?: string
      output?: OutputItem[]
      choices?: Array<{ message?: { content?: string; tool_calls?: ToolCall[] } }>
      conversation?: { id?: string }
      model?: string
      usage?: Usage
      tool_calls?: ToolCall[]
    }

    const tools = (input.tools || []).map(t => {
      if (t.type === 'web_search') {
        return { type: 'web_search' as const }
      }
      return {
        type: 'function' as const,
        name: t.name!,
        description: t.description!,
        parameters: t.parameters!
      }
    })

    const serializedOutput = typeof input.output === 'string' ? input.output : JSON.stringify(input.output)

    // Build input array: if developer_message exists, add it as a previous user message, then add function_call_output
    const inputItems: Array<{ type: string; role?: string; content?: string; call_id?: string; output?: string }> = []
    
    if (input.developer_message) {
      inputItems.push({
        type: 'message',
        role: 'developer',
        content: input.developer_message
      })
    }
    
    inputItems.push({
      type: 'function_call_output',
      call_id: input.toolCallId,
      output: serializedOutput
    })

    const modelConfig = getModelConfig(model)
    const requestBody: unknown = {
      model,
      conversation: { id: input.conversationId },
      instructions: input.systemInstructions,
      input: inputItems,
      max_output_tokens: maxTokens,
      // tool_outputs is not supported by the current SDK typings/backend; rely on function_call_output item
      ...(tools.length > 0 ? { tools, tool_choice: 'auto' as const, parallel_tool_calls: APP_CONSTANTS.openAi.functionCalling.parallelToolCalls } : {}),
      ...(modelConfig ? { reasoning: { effort: modelConfig.reasoningEffort }, text: { verbosity: modelConfig.textVerbosity } } : {})
    }
    const data = await (client.responses.create as unknown as (body: unknown) => Promise<unknown>)(requestBody) as unknown as SDKResponse

    let textResponse = ''
    if (typeof data.output_text === 'string' && data.output_text.length > 0) {
      textResponse = data.output_text
    } else if (Array.isArray(data.output)) {
      const messages = data.output.filter(o => o.type === 'message')
      const contents = messages.flatMap(m => m.content || [])
      const textParts = contents.filter(c => c.type === 'output_text' && typeof c.text === 'string').map(c => c.text as string)
      textResponse = textParts.join('\n').trim()
    } else if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
      textResponse = String(data.choices[0].message.content)
    }

    let functionCall: ConversationFunctionCall | undefined
    if (Array.isArray(data.output)) {
      const fnItem = data.output.find(o => o?.type === 'function_call') as
        | (OutputItem & { type: 'function_call' })
        | undefined
      if (fnItem && (fnItem.name || fnItem.tool?.name)) {
        const rawArgs = fnItem.arguments ?? fnItem.tool?.arguments ?? {}
        functionCall = {
          name: (fnItem.name ?? fnItem.tool?.name ?? '') as string,
          arguments: typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs),
          callId: fnItem.call_id
        }
      }
    }
    if (!functionCall) {
      const toolCalls = data.tool_calls || data.choices?.[0]?.message?.tool_calls || []
      const candidate = Array.isArray(toolCalls) ? toolCalls[0] : undefined
      if (candidate && candidate.type === 'function') {
        const args = candidate.function?.arguments
        functionCall = {
          name: candidate.function?.name || '',
          arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {})
        }
      }
    }

    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0,
        }
      : undefined

    return {
      response: textResponse || '',
      functionCall,
      usage,
      model: data.model
    }
  }
}

// Send a single developer-role message to a conversation
export async function sendDeveloperOnly(input: {
  conversationId: string
  developerMessage: string
  systemInstructions?: string
  model?: string
  maxTokens?: number
}): Promise<SendWithConversationOutput> {
  const model = input.model || 'gpt-4.1-mini'
  const maxTokens = input.maxTokens || 1000

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

  const inputItems: Array<{ type: string; role?: string; content?: string }> = [
    { type: 'message', role: 'developer', content: input.developerMessage }
  ]

  const modelConfig = getModelConfig(model)
  const requestBody: unknown = {
    model,
    conversation: { id: input.conversationId },
    instructions: input.systemInstructions || '',
    input: inputItems,
    max_output_tokens: maxTokens,
    ...(modelConfig ? { reasoning: { effort: modelConfig.reasoningEffort }, text: { verbosity: modelConfig.textVerbosity } } : {})
  }
  
  try {
    const data = await (client.responses.create as unknown as (body: unknown) => Promise<unknown>)(requestBody) as unknown as SDKResponse

    let textResponse = ''
    if (typeof data.output_text === 'string' && data.output_text.length > 0) {
      textResponse = data.output_text
    } else if (Array.isArray(data.output)) {
      const messages = data.output.filter(o => o.type === 'message')
      const contents = messages.flatMap(m => m.content || [])
      const textParts = contents.filter(c => c.type === 'output_text' && typeof c.text === 'string').map(c => c.text as string)
      textResponse = textParts.join('\n').trim()
    } else if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
      textResponse = String(data.choices[0].message.content)
    }

    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0,
        }
      : undefined

    return { response: textResponse || '', usage, model: data.model }
  } catch (error: unknown) {
    // Transform OpenAI SDK errors to be compatible with safeCall rate limit detection
    throw transformOpenAIError(error)
  }
}

// Lightweight wrappers kept for compatibility with previous imports
export async function callOpenAIConversation(input: {
  conversationId: string
  userText: string
  systemInstructions: string
  developer_message: string
  model: string
  maxTokens: number
  imageUrl?: string
  tools?: ToolDefinition[]
  toolOutputs?: Array<{ callId: string; output: unknown }>
}): Promise<FunctionCallResult> {
  const result = await OpenAIConversations.sendWithConversation({
    conversationId: input.conversationId,
    userText: input.userText,
    systemInstructions: input.systemInstructions,
    developer_message: input.developer_message,
    model: input.model,
    maxTokens: input.maxTokens,
    imageUrl: input.imageUrl,
    tools: input.tools,
    toolOutputs: input.toolOutputs
  })
  return {
    response: result.response,
    tokens: result.usage?.totalTokens || 0,
    functionCall: result.functionCall,
    usage: result.usage,
    model: result.model
  }
}

export async function callOpenAIToolOutput(input: {
  conversationId: string
  systemInstructions: string
  developer_message?: string
  model: string
  maxTokens: number
  toolCallId: string
  output: unknown
  tools?: ToolDefinition[]
}): Promise<FunctionCallResult> {
  const result = await OpenAIConversations.respondWithToolOutput({
    conversationId: input.conversationId,
    systemInstructions: input.systemInstructions,
    developer_message: input.developer_message,
    model: input.model,
    maxTokens: input.maxTokens,
    toolCallId: input.toolCallId,
    output: input.output,
    tools: input.tools
  })
  return {
    response: result.response,
    tokens: result.usage?.totalTokens || 0,
    functionCall: result.functionCall,
    usage: result.usage,
    model: result.model
  }
}

// Generate AI response with tool loop
export async function generateAIResponse(
  userMessage: string,
  userData: users,
  sessionData: sessions,
  imageUrl?: string,
  activeLocalizationsIds?: string[]
): Promise<FunctionCallResult> {
  let developer_message = ''
  let finalInstructions = ''
  try {
    if (Date.now() - lastGlobalConfigurationUpdate > REFRESH_INTERVAL_MS) {
      lastGlobalConfigurationUpdate = Date.now()
      globalConfiguration = await GlobalConfigModel.findActive()
    }
    let instructions = process.env.instructions
    let model: string = APP_CONSTANTS.openAi.models.default
    let maxTokens: number = APP_CONSTANTS.openAi.request.defaultMaxTokens
    let responseFormat = ''
    if (globalConfiguration) {
      if (globalConfiguration.responder_instructions) {
        instructions = globalConfiguration.onboarding_instructions as string
      }
      if (globalConfiguration.responder_model) {
        model = globalConfiguration.onboarding_model as string
      }
      if (globalConfiguration.responder_max_tokens) {
        maxTokens = globalConfiguration.onboarding_max_tokens as number
      }
      if (globalConfiguration.responder_response_format) {
        responseFormat = globalConfiguration.onboarding_response_format as string
      }
    }
    logger.debug('Global configuration for onboarding:', {
      instructions: previewString(instructions, APP_CONSTANTS.openAi.logging.instructionsPreviewLength),
      model,
      maxTokens,
      responseFormat,
    })
    const session = sessionData

    const isOnboardingComplete = userData.onboarding_status === 'done'
    let developerLocationsMapping = ''
    let activeLocationsCount = activeLocalizationsIds?.length || 0

    if (isOnboardingComplete && activeLocalizationsIds && activeLocalizationsIds.length > 0) {
      try {
        const locations = await LocationsModel.findByIds(activeLocalizationsIds, {
          id: true,
          reference: true,
          name: true
        })
        activeLocationsCount = locations.length
        developerLocationsMapping = locations
          .filter(location => location.name)
          .map(location => `reference: ${location.reference ?? 'N/A'}, name: ${location.name}\n`)
          .join('')
      } catch (error) {
        logger.error('Failed to load locations for developer message', {
          userId: userData.id,
          error
        })
        developerLocationsMapping = ''
      }
    } else if (!isOnboardingComplete) {
      developerLocationsMapping = 'dato vacio\n'
      activeLocationsCount = 0
    }

    developer_message =
      `User's username: ${userData.username}\n` +
      `User's name: ${userData.name || 'no saved name'} ${userData.lastname || ''}\n` +
      `User's onboarding status: ${userData.onboarding_status}\n` +
      `active locations count: ${activeLocationsCount}\n` +
      `Location names:\n${developerLocationsMapping || 'No active locations\n'}`
    finalInstructions = instructions || ``
    
    // Include ALL tools: web_search + custom functions
    const allTools = AVAILABLE_FUNCTIONS
    
    const maxIterations = APP_CONSTANTS.openAi.functionCalling.maxIterations
    const functionResults: Array<{ name: string; result: unknown }> = []
    const executedFunctionCalls: Array<{ name: string; arguments: string }> = []
    const baseInput = {
      conversationId: session?.conversation_id as string,
      userText: userMessage,
      systemInstructions: finalInstructions,
      developer_message,
      model: model,
      maxTokens,
      imageUrl: imageUrl,
      tools: allTools
    }
    logger.debug('OpenAI initial input', {
      userText: userMessage,
      systemInstructions: finalInstructions,
      developer_message,
      model: model,
      maxTokens,
    })
    const firstResponse = await callOpenAIConversation(baseInput)
    if (!firstResponse.functionCall) {
      logger.debug('OpenAI returned final text response (no function call)', {
        userId: userData.id,
        sessionId: sessionData.id,
        outputLength: firstResponse.response.length,
        tokensUsed: firstResponse.usage?.totalTokens,
        model: firstResponse.model,
      })
      return {
        response: firstResponse.response,
        tokens: firstResponse.usage?.totalTokens || 0,
        summary: '',
        developer_message: developer_message,
        usage: firstResponse.usage,
        executedFunctionCalls: [],
      }
    }
    let aiResponse = firstResponse
    for (let iteration = 0; iteration < maxIterations && aiResponse.functionCall; iteration++) {
      logger.debug(`OpenAI function-call iteration ${iteration + 1}/${maxIterations}`, {
        userId: userData.id,
        sessionId: sessionData.id,
        functionCallId: aiResponse.functionCall.callId,
      })
      logger.debug('OpenAI returned function call, executing...', {
        functionName: aiResponse.functionCall.name,
        arguments: aiResponse.functionCall.arguments,
      })
      executedFunctionCalls.push({
        name: aiResponse.functionCall.name,
        arguments: aiResponse.functionCall.arguments
      })
      const result = await executeFunction(aiResponse.functionCall, {
        userId: userData.id,
        onboarding_status: userData.onboarding_status
      })
      functionResults.push({ name: aiResponse.functionCall.name, result })
      logger.debug('Function result', { result })
      const callId = aiResponse.functionCall.callId
      if (!callId) {
        logger.debug('Function call did not include callId; cannot send tool output. Returning fallback response.', {})
        return {
          response: "I've processed your request. How else can I help you today?",
          functionCall: { name: aiResponse.functionCall.name, arguments: '' },
          functionResult: result,
          tokens: aiResponse.usage?.totalTokens || 0,
          developer_message: developer_message,
          executedFunctionCalls: executedFunctionCalls,
        }
      }
      aiResponse = await callOpenAIToolOutput({
        conversationId: session?.conversation_id as string,
        systemInstructions: finalInstructions,
        model: model,
        maxTokens,
        toolCallId: callId,
        output: result,
        tools: iteration !== maxIterations - 1 ?  allTools : []
      })
      if (!aiResponse.functionCall) {
        logger.debug('OpenAI returned final text response after tool output', {
          userId: userData.id,
          sessionId: sessionData.id,
          iteration: iteration + 1,
          outputLength: aiResponse.response.length,
          tokensUsed: aiResponse.usage?.totalTokens,
          model: aiResponse.model,
          functionCallsExecuted: functionResults.length,
        })
        return {
          response: aiResponse.response,
          tokens: aiResponse.usage?.totalTokens || 0,
          summary: '',
          functionCall: functionResults.length > 0 ? { name: functionResults[0].name, arguments: '' } : undefined,
          functionResult: functionResults.length > 0 ? functionResults[0].result : undefined,
          usage: aiResponse.usage,
          developer_message: developer_message,
          executedFunctionCalls: executedFunctionCalls,
        }
      }
    }
    logger.debug('Maximum iterations reached, returning last response', { userId: userData.id, sessionId: sessionData.id })
    return {
      response: "I've processed your request. How else can I help you today?",
      tokens: aiResponse.usage?.totalTokens || 0,
      functionCall: functionResults.length > 0 ? { name: functionResults[functionResults.length - 1].name, arguments: '' } : undefined,
      functionResult: functionResults.length > 0 ? functionResults[functionResults.length - 1].result : undefined,
      executedFunctionCalls: executedFunctionCalls,
    }
  } catch (error) {
    logger.error('Error generating AI response', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorcallid: (error as Error).message.split(' ').pop()?.replace('.', '') || undefined,
      userId: userData.id,
      sessionId: sessionData.id,
      userMessage: previewString(userMessage, APP_CONSTANTS.openAi.errorRecovery.userMessagePreviewLength)
    })
    const previousSessionId = sessionData?.id
    const userId = sessionData?.user_id || userData.id
    let recentDialogMessages: messages[] = []
    if (previousSessionId) {
      try {
        recentDialogMessages = await MessagesModel.findRecentDialogMessages(
          previousSessionId,
          ERROR_RECENT_DIALOG_MESSAGES_LIMIT
        )
      } catch (recentMessagesError) {
        logger.error('Failed to load recent dialog messages during recovery', {
          recentMessagesError,
          sessionId: previousSessionId
        })
      }
    }

    const dialogSeed = recentDialogMessages.map(dialogMessage => ({
      role: dialogMessage.role === 'user' ? 'user' : 'assistant',
      content: dialogMessage.content || ''
    }))

    let summaryText = ''
    try {
      const summaryConversationId = await OpenAIConversations.createConversation(
        dialogSeed.length > 0 ? dialogSeed : undefined
      )
      let summaryModel: string = APP_CONSTANTS.openAi.models.defaultSummary
      let summaryMaxTokens: number = APP_CONSTANTS.openAi.request.summaryMaxTokens
      if (globalConfiguration) {
        if (globalConfiguration.onboarding_model) {
          summaryModel = globalConfiguration.onboarding_model as string
        }
        if (globalConfiguration.onboarding_max_tokens) {
          summaryMaxTokens = globalConfiguration.onboarding_max_tokens as number
        }
      }
      summaryText = await summarizeMessages(summaryConversationId, summaryModel, summaryMaxTokens * APP_CONSTANTS.openAi.request.summaryModelMultiplier)
      if (previousSessionId) {
        await SessionsModel.updateSession(previousSessionId, { summary: summaryText })
      }
    } catch (summaryError) {
      logger.error('Failed to summarize conversation during recovery', {
        summaryError,
        sessionId: previousSessionId
      })
    }

    if (previousSessionId) {
      try {
        await MessagesModel.createMessage({
          session_id: previousSessionId,
          role: 'system',
          content: `Responder error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          whatsapp_message_id: null
        })
      } catch (systemMessageError) {
        logger.error('Failed to persist system error message', { systemMessageError, sessionId: previousSessionId })
      }
    } else {
      logger.error('No previous session id found', { userId: userData.id, sessionId: sessionData.id })
    }

    try {
      const seededConversationMessages = [
        {
          role: 'developer',
          content: summaryText || 'Conversación reiniciada después de un error inesperado.'
        },
        ...dialogSeed,
        { role: 'system', content: ERROR_SYSTEM_MESSAGE }
      ]
      const recoveryConversationId = await OpenAIConversations.createConversation(seededConversationMessages)
      await SessionsModel.createSession({
        user_id: userId,
        conversation_id: recoveryConversationId,
        agent_managed: sessionData?.agent_managed ?? true,
        tokens: 0
      })
    } catch (recoveryError) {
      logger.error('Failed to create recovery session after OpenAI error', {
        recoveryError,
        sessionId: previousSessionId
      })
      if (previousSessionId) {
        try {
          await MessagesModel.createMessage({
            session_id: previousSessionId,
            role: 'system',
            content: `Responder recovery error: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown error'}`,
            whatsapp_message_id: null
          })
        } catch (persistRecoveryError) {
          logger.error('Failed to persist system message after recovery error', {
            persistRecoveryError,
            sessionId: previousSessionId
          })
        }
      }
    }

    return { response: '', tokens: 0, executedFunctionCalls: [] }
  }
}

// Generate AI response without tools
// Sends a developer message via OpenAI and WhatsApp
export async function sendDeveloperMessage(
  developerMessage: string,
  waid: string
): Promise<{ success: boolean; error?: string; messageId?: string; reply?: string; needs_action?: boolean }> {
  try {
    logger.debug('Processing developer message', { waid })
    const formattedPhoneNumber = MessageUtils.formatPhoneNumber(MessageUtils.extractPhoneNumber(waid))
    const userData = await UsersModel.findUserByWaId(formattedPhoneNumber)
    let session
    let userId: string
    let sessionId: string
    if (!userData || !userData.id || !userData.sessions) {
      logger.debug('Creating new user and session for developer message', { phoneNumber: formattedPhoneNumber })
      const result = await UsersModel.createUser({ username: '', wa_id: formattedPhoneNumber, role: 'USER', onboarding_status: 'user' })
      if (!result) {
        logger.error('Error creating new user and session')
        return { success: false, error: 'Error creating new user and session' }
      }
      userId = result.user.id
      sessionId = result.session.id
      session = result.session
    } else {
      userId = userData.id
      session = userData.sessions[0]
      sessionId = session.id
    }
    if (!session?.conversation_id) {
      const newConversationId = await OpenAIConversations.createConversation()
      await SessionsModel.updateSession(sessionId, { conversation_id: newConversationId, user_id: session.user_id, agent_managed: session.agent_managed })
      session = { ...session, conversation_id: newConversationId } as sessions
    }
    const globalRateLimitState: GlobalRateLimitState = { cooldownUntil: 0 }
    const rateLimitTracker = { hasRateLimit: false }
    
    const aiResponse = await enqueueByWaId(formattedPhoneNumber, async () => {
      if (Date.now() - lastGlobalConfigurationUpdate > REFRESH_INTERVAL_MS) {
        globalConfiguration = await GlobalConfigModel.findActive()
        lastGlobalConfigurationUpdate = Date.now()
      }
      let instructions = process.env.instructions
      let model: string = APP_CONSTANTS.openAi.models.default
      let maxTokens: number = APP_CONSTANTS.openAi.request.defaultMaxTokens
      if (globalConfiguration) {
        if (globalConfiguration.onboarding_instructions) instructions = globalConfiguration.onboarding_instructions as string
        if (globalConfiguration.onboarding_model) model = globalConfiguration.onboarding_model as string
        if (globalConfiguration.onboarding_max_tokens) maxTokens = globalConfiguration.onboarding_max_tokens as number
      }
      const result = await safeCall(
        async () => {
          return await sendDeveloperOnly({
            conversationId: (session as sessions).conversation_id as string,
            developerMessage: developerMessage,
            systemInstructions: instructions || '',
            model,
            maxTokens,
          })
        },
        APP_CONSTANTS.openAi.rateLimit.retryAttempts,
        undefined,
        rateLimitTracker,
        globalRateLimitState
      )
      return { response: result.response, usage: result.usage }
    })
    // Parse JSON-shaped response { needs_action, reply }
    let replyText = aiResponse.response
    let needsAction: boolean | undefined = undefined
    try {
      const parsed = JSON.parse(aiResponse.response)
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.reply === 'string') replyText = parsed.reply
        if (typeof parsed.needs_action === 'boolean') needsAction = parsed.needs_action
      }
    } catch {
      // Not JSON; keep plain text
    }

    const whatsappResponse = await whatsappService.sendTextMessage(waid, replyText, process.env.WHATSAPP_PHONE_NUMBER_ID || undefined)
    if (!whatsappResponse) {
      logger.error('Failed to send WhatsApp response')
      return { success: false, error: 'Failed to send WhatsApp response' }
    }
    logger.debug('Successfully sent developer message response', { whatsappMessageId: whatsappResponse.messages[0]?.id, to: waid, userId, sessionId })
    const savedMessages = await MessagesModel.createMessagesBatch(aiResponse.usage?.totalTokens || 0, [
      { session_id: sessionId, role: 'employee', content: developerMessage, whatsapp_message_id: null },
      { session_id: sessionId, role: 'agent', content: replyText, whatsapp_message_id: null }
    ])
    logger.debug('Saved developer messages in batch', { employeeMessageId: savedMessages[0].id, aiMessageId: savedMessages[1].id, sessionId })
    return { success: true, messageId: whatsappResponse.messages[0]?.id, reply: replyText, needs_action: needsAction }
  } catch (error) {
    logger.error('Error processing developer message', { error: error instanceof Error ? error.message : 'Unknown error', waid })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

/**
 * Summarizes messages from a conversation
 * @param conversationId - OpenAI conversation ID
 * @param model - Model to use for summarization
 * @param maxTokens - Maximum tokens for the summary
 * @param summaryType - Type of summary: 'reviews' for Google My Business reviews, 'conversation' for WhatsApp conversations (default: 'conversation')
 * @returns Summary string
 */
export async function summarizeMessages(
  conversationId: string, 
  model: string, 
  maxTokens: number = APP_CONSTANTS.openAi.request.defaultMaxTokens,
  summaryType: 'reviews' | 'conversation' = 'conversation'
): Promise<string> {
  try {
    const prompts = summaryType === 'reviews' 
      ? APP_CONSTANTS.openAi.summary.reviews
      : APP_CONSTANTS.openAi.summary.conversation
    
    const time = Date.now()
    const result = await sendDeveloperOnly({
      conversationId: conversationId,
      developerMessage: prompts.developerMessage,
      systemInstructions: prompts.systemInstructions,
      model: model,
      maxTokens: maxTokens,
    })
    logger.debug('Summarizing messages', { conversationId, model, maxTokens, time: Date.now() - time })
    return result.response || ''
  } catch (error) {
    logger.error('Error summarizing messages', {
      error: error instanceof Error ? error.message : 'Unknown error',
      conversationId
    })
    return 'Error generating summary'
  }
}
