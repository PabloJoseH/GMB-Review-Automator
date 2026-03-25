/**
 * Application-wide constants
 * Organized by functional area for better maintainability
 */

export const APP_CONSTANTS = {
  /**
   * Brand and UI configuration
   */
  brand: {
    /**
     * Company/brand name
     */
    companyName: "Local Responder",

    /**
     * Parent company legal name
     */
    parentCompany: "Numa Labs",

    /**
     * Logo URL path
     */
    logoUrl: "/logo.svg",

    /**
     * Website domain
     */
    website: "localresponder.app",

    /**
     * Contact email
     */
    email: "talk@localresponder.app",
  },

  /**
   * Google My Business API configuration
   */
  gmb: {
    /**
     * Maximum number of reviews to fetch per location from Google My Business API
     */
    maxReviewsPerLocation: 250,
    /**
     * Maximum number of locations to process in a single batch
     */
    maxLocationsLimit: 5000,
    /**
     * Maximum batch size for sending responses to GMB
     */
    maxBatchSizeGmb: 5,
    /**
     * Request timeout in milliseconds for GMB API calls
     */
    requestTimeout: 15000,
    /**
     * Number of retry attempts for GMB API calls
     */
    retryAttempts: 5,
    /**
     * Base delay in milliseconds for rate limit handling
     */
    rateLimitDelayBase: 1000,
    /**
     * Default maximum reviews per location when not specified
     */
    defaultMaxPerLocation: 100,
    /**
     * Page size for paginated GMB API requests
     */
    pageSize: 50,
    /**
     * Fetch timeout in milliseconds for GMB API requests
     */
    fetchTimeout: 30000,
  },

  /**
   * Pub/Sub notification processing configuration
   */
  pubSub: {
    /**
     * Number of parallel requests to fetch notifications from Pub/Sub
     */
    parallelFetchRequests: 10,

    /**
     * Maximum number of fetch iterations before stopping
     */
    maxFetchIterations: 10,

    /**
     * Retry delay in milliseconds when Pub/Sub fetch errors occur
     */
    retryDelayMs: 60000, // 1 minute

    /**
     * Batch size for grouping notifications before processing
     */
    notificationBatchSize: 1000,

    /**
     * Number of notification batches to process in parallel
     */
    parallelBatchProcessing: 10,

    /**
     * Batch size for fetching Google reviews from API
     */
    reviewFetchBatchSize: 100,

    /**
     * Batch size for processing reviews with OpenAI
     */
    reviewProcessingBatchSize: 100,
  },

  /**
   * OpenAI API configuration
   */
  openAi: {
    /**
     * Model configuration
     */
    models: {
      /**
       * Default OpenAI model name
       */
      default: 'gpt-4.1-mini',
      /**
       * Default summary model name
       */
      defaultSummary: 'gpt-4.1-mini',
      /**
       * Whisper model for speech-to-text
       */
      whisper: 'whisper-1',
    },

    /**
     * Request configuration
     */
    request: {
      /**
       * Default maximum tokens for OpenAI requests
       */
      defaultMaxTokens: 1000,
      /**
       * Default temperature for OpenAI requests
       */
      defaultTemperature: 0,
      /**
       * Maximum tokens for summary generation
       */
      summaryMaxTokens: 1000,
      /**
       * Multiplier for summary max tokens calculation
       */
      summaryModelMultiplier: 3,
      /**
       * Client timeout in milliseconds (5 minutes)
       */
      clientTimeout: 300 * 1000,
    },

    /**
     * Summary generation prompts
     */
    summary: {
      /**
       * Prompts for summarizing Google My Business reviews
       */
      reviews: {
        /**
         * System instructions for summarizing reviews
         */
        systemInstructions: `You are an expert insight extractor. You will analyze up to 250 Google reviews and produce a short, high-signal summary (8–12 lines maximum). The summary must be concise but insightful, capturing the core identity of the business. Your summary MUST include:
- Overall sentiment with nuance
- What customers praise most (specific themes)
- Main complaints or pain points (even rare ones)
- What makes the business unique or different
- What type of customers it attracts
- Any recurring mentions of staff or products
- The general tone or atmosphere customers perceive
- A brief note on what the AI should emphasize when replying to reviews
Rules:
- Keep it short and sharp (8–12 lines).
- No bullet points. No DAFO. No long paragraphs.
- No generic statements; be specific to the reviews.
- Do NOT invent information.
- Return only the summary.
`,
        /**
         * Developer message for summarizing reviews
         */
        developerMessage: `Analyze the following reviews and produce a short, specific 8–12 line insight summary following the system instructions. Avoid generic content.`,
      },
      /**
       * Prompts for summarizing WhatsApp conversations
       */
      conversation: {
        /**
         * System instructions for summarizing conversations
         */
        systemInstructions: `You are a helpful assistant that summarizes messages.
You will be given a list of messages and you will need to summarize them.
You will need to summarize the messages in a way that is easy to understand and concise.
The summary should capture the key points, context, and important information from the conversation.
Return only the summary text, without any additional explanations or formatting.`,
        /**
         * Developer message for summarizing conversations
         */
        developerMessage: `Please provide a comprehensive summary of this conversation. Include all key points, important context, and any relevant information that would be useful for continuing the conversation in a new session.`,
      },
    },

    /**
     * Rate limiting and concurrency
     */
    rateLimit: {
      /**
       * Number of retry attempts for OpenAI API calls
       */
      retryAttempts: 7,
      /**
       * Initial concurrency limit for OpenAI API calls
       */
      initialConcurrency: 20,
      /**
       * Minimum concurrency limit when rate limited
       */
      minConcurrency: 4,
      /**
       * Rate limit reduction factor (multiplier when rate limit occurs)
       * Example: 0.75 means reduce to 75% of current limit
       */
      reductionFactor: 0.75,
    },

    /**
     * Function calling configuration
     */
    functionCalling: {
      /**
       * Maximum iterations for function calling loops
       */
      maxIterations: 10,
      /**
       * Default parallel tool calls setting
       */
      parallelToolCalls: false,
    },

    /**
     * Tool/Function limits
     */
    tools: {
      /**
       * Default limit for query_sample_reviews_data
       */
      sampleReviewsDefaultLimit: 50,
      /**
       * Maximum limit for query_sample_reviews_data
       */
      sampleReviewsMaxLimit: 50,
      /**
       * Default page size for get_google_reviews
       */
      googleReviewsDefaultPageSize: 20,
      /**
       * Maximum page size for get_google_reviews
       */
      googleReviewsMaxPageSize: 100,
      /**
       * Default limit for get_proposed_responses
       */
      proposedResponsesDefaultLimit: 50,
      /**
       * Maximum limit for get_proposed_responses
       */
      proposedResponsesMaxLimit: 100,
    },

    /**
     * Error recovery configuration
     */
    errorRecovery: {
      /**
       * Limit for recent dialog messages in error recovery
       */
      recentDialogMessagesLimit: 5,
      /**
       * Preview length for user messages in error logs
       */
      userMessagePreviewLength: 100,
    },

    /**
     * Logging configuration
     */
    logging: {
      /**
       * Preview length for instructions in debug logs
       */
      instructionsPreviewLength: 100,
    },

    /**
     * Configuration cache
     */
    cache: {
      /**
       * Refresh interval for global configuration cache
       */
      refreshIntervalMs: {
        production: 1000 * 60 * 10, // 10 minutes
        development: 30 * 1000, // 30 seconds
      },
    },

    /**
     * Model-specific configurations
     * Detects model family and applies appropriate parameters
     */
    modelConfigs: {
      /**
       * GPT-5 model family configuration
       */
      gpt5: {
        /**
         * Pattern to detect GPT-5 models (matches gpt-5, gpt-5.1, etc.)
         */
        detectionPattern: 'gpt-5',
        /**
         * Reasoning effort for GPT-5 models
         */
        reasoningEffort: 'minimal',
        /**
         * Text verbosity for GPT-5 models
         */
        textVerbosity: 'low',
      },
      /**
       * GPT-5.1 model family configuration
       */
      gpt51: {
        /**
         * Pattern to detect GPT-5.1 models
         */
        detectionPattern: 'gpt-5.1',
        /**
         * Reasoning effort for GPT-5.1 models
         */
        reasoningEffort: 'none',
        /**
         * Text verbosity for GPT-5.1 models
         */
        textVerbosity: 'medium',
      },
    },
  },

  /**
   * Database configuration
   */
  database: {
    /**
     * Batch processing configuration
     */
    batch: {
      /**
       * Chunk size for creating records in batch operations
       */
      createChunkSize: 1000,
      /**
       * Chunk size for updating records in batch operations
       */
      updateChunkSize: 200,
      /**
       * Default batch size for general batch operations
       */
      defaultBatchSize: 20,
      /**
       * Default limit for pagination and queries
       */
      defaultLimit: 10,
    },

    /**
     * Database field limits
     */
    fieldLimits: {
      /**
       * Maximum length for author name field
       */
      authorName: 200,
      /**
       * Maximum length for comment field
       */
      comment: 2000,
      /**
       * Maximum length for response field
       */
      response: 2000,
    },

    /**
     * Pagination defaults
     */
    pagination: {
      /**
       * Default page size for paginated queries
       */
      defaultPageSize: 20,
      /**
       * Default limit for queries
       */
      defaultLimit: 10,
      /**
       * Default limit for reviews queries
       */
      reviewsDefaultLimit: 50,
      /**
       * Maximum limit for reviews queries
       */
      reviewsMaxLimit: 100,
    },

    /**
     * Query defaults
     */
    query: {
      /**
       * Default offset for paginated queries
       */
      defaultOffset: 0,
      /**
       * Default page number
       */
      defaultPage: 1,
      /**
       * Default limit for recent messages
       */
      recentMessagesLimit: 5,
      /**
       * Maximum limit for paginated queries
       */
      maxLimit: 100,
      /**
       * Default limit for summary queries
       */
      summaryLimit: 50,
    },
  },

  /**
   * Analytics configuration
   */
  analytics: {
    /**
     * Maximum number of recent reviews to include in analytics
     */
    recentReviewsLimit: 5,
    /**
     * Character limit for comment preview in analytics
     */
    recentReviewCommentPreview: 100,
  },

  /**
   * Clerk API configuration
   */
  clerk: {
    /**
     * API endpoints
     */
    api: {
      /**
       * Base URL for Clerk API
       */
      baseUrl: 'https://api.clerk.com/v1',
      /**
       * API version
       */
      version: 'v1',
    },

    /**
     * Token configuration
     */
    token: {
      /**
       * Preview length for token logging (first N characters)
       */
      previewLength: 20,
      /**
       * HTTP status code for expired token
       */
      expiredStatusCode: 422,
      /**
       * Error message pattern for missing refresh token
       */
      missingRefreshTokenPattern: 'oauth_missing_refresh_token',
    },

    /**
     * Pagination defaults
     */
    pagination: {
      /**
       * Default page number
       */
      defaultPage: 1,
      /**
       * Default limit for single-item responses
       */
      singleItemLimit: 1,
      /**
       * Default total for single-item responses
       */
      singleItemTotal: 1,
      /**
       * Default total pages for single-item responses
       */
      singleItemTotalPages: 1,
      /**
       * Default values for empty pagination
       */
      empty: {
        page: 1,
        limit: 1,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    },

    /**
     * Error handling
     */
    errors: {
      /**
       * HTTP status code for not found
       */
      notFoundStatusCode: 404,
      /**
       * Patterns to detect "not found" errors
       */
      notFoundPatterns: ['not found', '404'],
    },
  },

  /**
   * Stripe API configuration
   */
  stripe: {
    /**
     * Price configuration
     */
    price: {
      /**
       * Preview length for price ID logging (first N characters)
       */
      previewLength: 10,
      /**
       * Conversion factor from smallest currency unit to main unit (cents to dollars/euros)
       */
      currencyConversionFactor: 100,
    },

    /**
     * Trial period conversion
     */
    trialPeriod: {
      /**
       * Days per week
       */
      daysPerWeek: 7,
      /**
       * Days per month (approximate)
       */
      daysPerMonth: 30,
      /**
       * Days per year (approximate)
       */
      daysPerYear: 365,
    },

    /**
     * Country code normalization
     */
    countryCode: {
      /**
       * Minimum length for country code
       */
      minLength: 2,
    },
  },

  /**
   * API helpers configuration
   */
  apiHelpers: {
    /**
     * Default batch size for batch operations
     */
    defaultBatchSize: 20,
    /**
     * Default delay between batches in milliseconds
     */
    defaultDelayBetweenBatches: 0,
    /**
     * Default number of retries for batch operations
     */
    defaultRetries: 0,
    /**
     * Default retry delay in milliseconds
     */
    defaultRetryDelay: 500,
    /**
     * Buffer time in milliseconds added to Retry-After header
     */
    retryAfterBufferMs: 1000,
    /**
     * Default number of retries for safeCall function
     */
    defaultSafeCallRetries: 5,
    /**
     * Base delay in milliseconds for exponential backoff (2 seconds)
     */
    exponentialBackoffBase: 2000,
  },

  /**
   * WhatsApp Business API configuration
   */
  whatsapp: {
    /**
     * API version defaults
     */
    api: {
      /**
       * Default API version for WhatsApp Business API
       */
      defaultVersion: 'v24.0',
      /**
       * Legacy API version fallback
       */
      legacyVersion: 'v18.0',
      /**
       * Base URL for WhatsApp Graph API
       */
      baseUrl: 'https://graph.facebook.com',
    },

    /**
     * Message processing configuration
     */
    message: {
      /**
       * Limit for recent dialog messages in conversation restart
       */
      recentDialogMessagesLimit: 5,
      /**
       * System message for conversation summary restart
       */
      summarySystemMessage: 'La respuesta de este turno no es importante y responde "si".',
    },

    /**
     * Logging configuration
     */
    logging: {
      /**
       * Preview length for signatures in debug logs
       */
      signaturePreviewLength: 20,
    },
  },

  /**
   * Dashboard configuration
   */
  dashboard: {
    /**
     * Token threshold configuration for conversations table
     */
    tokens: {
      /**
       * Default threshold tokens value (fallback if no global config is active)
       */
      defaultThreshold: 500000,
    },
  },
} as const;

