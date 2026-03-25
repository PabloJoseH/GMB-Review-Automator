import { createLogger } from '@/lib/logger'
import { APP_CONSTANTS } from '@/lib/constants'

const logger = createLogger('API-HELPERS');
/**
 * API Helpers - Utility Functions for Google My Business API and Auth Validation
 * 
 * This module provides helper functions for working with Google My Business API data,
 * including validation and formatting of opening hours, as well as authentication
 * parameter validation for the WhatsApp integration flow.
 * 
 * Key features:
 * - Google opening hours period validation
 * - Google time formatting to readable strings
 * - WhatsApp authentication parameter validation
 * - Type-safe interfaces for all data structures
 */

/**
 * Represents a Google time object with hours and minutes
 */
interface GoogleTime {
  hours: number;
  minutes?: number; // Optional, defaults to 0 if not present
}

/**
 * Represents a Google opening period with open/close days and times
 */
interface GoogleOpeningPeriod {
  openDay?: string;
  closeDay?: string;
  openTime?: GoogleTime;
  closeTime?: GoogleTime;
}

/**
 * Validates if a Google opening period object is valid
 * Allows periods with only openTime or only closeTime for flexibility
 * 
 * @param period - The Google opening period to validate
 * @returns True if the period is valid, false otherwise
 * 
 * @example
 * const period = { openDay: 'MONDAY', closeDay: 'MONDAY', openTime: { hours: 9, minutes: 0 }, closeTime: { hours: 17, minutes: 0 } };
 * const isValid = isValidGoogleOpeningPeriod(period); // true
 */
export function isValidGoogleOpeningPeriod(period: unknown): boolean {
  if (!period || typeof period !== 'object') {
    return false
  }
  
  const p = period as GoogleOpeningPeriod;
  
  // At least one day must be present (openDay or closeDay)
  if (!p.openDay && !p.closeDay) {
    return false
  }
  
  // At least one time must be present (openTime or closeTime)
  if (!p.openTime && !p.closeTime) {
    return false
  }
  
  // Validate openTime if present
  if (p.openTime) {
    if (typeof p.openTime.hours !== 'number') {
      return false
    }
    // minutes is optional, but if present must be a number
    if (p.openTime.minutes !== undefined && typeof p.openTime.minutes !== 'number') {
      return false
    }
  }
  
  // Validate closeTime if present
  if (p.closeTime) {
    if (typeof p.closeTime.hours !== 'number') {
      return false
    }
    // minutes is optional, but if present must be a number
    if (p.closeTime.minutes !== undefined && typeof p.closeTime.minutes !== 'number') {
      return false
    }
  }
  
  return true
}

/**
 * Converts a Google time object to a string in HH:MM format
 * Minutes are optional and default to 0 if not present
 * 
 * @param googleTime - Google time object with hours and optional minutes
 * @returns String in HH:MM format or null if invalid
 * 
 * @example
 * const time = { hours: 9, minutes: 30 };
 * const formatted = formatGoogleTimeToString(time); // "09:30"
 * 
 * @example
 * const time = { hours: 9 }; // minutes defaults to 0
 * const formatted = formatGoogleTimeToString(time); // "09:00"
 */
export function formatGoogleTimeToString(googleTime: unknown): string | null {
  if (!googleTime || typeof googleTime !== 'object') {
    return null
  }
  
  const time = googleTime as GoogleTime;
  if (typeof time.hours !== 'number') {
    return null
  }
  
  // minutes is optional, default to 0
  const minutes = time.minutes ?? 0;
  
  // Validate ranges (hours: 0-23, minutes: 0-59)
  if (time.hours < 0 || time.hours > 23) {
    return null
  }
  
  if (minutes < 0 || minutes > 59) {
    return null
  }
  
  // Format with zero padding
  const hours = time.hours.toString().padStart(2, '0')
  const minutesStr = minutes.toString().padStart(2, '0')
  
  return `${hours}:${minutesStr}`
}

/**
 * Auth Validation - Authentication parameter validation functions
 * 
 * The userId is REQUIRED for the WhatsApp registration flow.
 * Users must arrive with a valid userId query parameter (?u=userId).
 * Additionally, the userId must exist in the database to proceed with sign-up.
 */


/**
 * Clerk User Validation - Validates Clerk user data
 */

import type { User } from '@clerk/nextjs/server';

/**
 * Result of Clerk user validation
 */
interface ClerkUserValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates Clerk user data
 * 
 * Ensures the user object from Clerk has all required fields
 * and is in a valid state for processing.
 * 
 * @param user - Clerk user object or null
 * @returns Validation result with error message if invalid
 * 
 * @example
 * const user = await currentUser();
 * const validation = validateClerkUser(user);
 * if (!validation.isValid) {
 *   throw new Error(validation.error);
 * }
 */
export function validateClerkUser(user: User | null): ClerkUserValidationResult {
  if (!user) {
    return {
      isValid: false,
      error: 'user_not_found',
    };
  }

  if (!user.id) {
    return {
      isValid: false,
      error: 'user_id_missing',
    };
  }

  // Check for at least one email address
  if (!user.primaryEmailAddress?.emailAddress && !user.emailAddresses?.length) {
    return {
      isValid: false,
      error: 'email_missing',
    };
  }

  return {
    isValid: true,
  };
}

type BatchResult<T, R> = {
  batchIndex: number;
  items: T[];
  success: boolean;
  error?: unknown;
  batchResult?: R[];
};

type RunBatchesOptions<T> = {
  batchSize?: number;         // tamaño del batch (def: 20)
  delayBetweenBatchesMs?: number; // opcional, espera entre batches (def: 0)
  retries?: number;           // reintentos por batch (def: 0)
  retryDelayMs?: number;      // delay entre reintentos (def: 500)
  onError?: (err: unknown, batchIndex: number, items: T[]) => Promise<void> | void;
};

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

/**
 * Ejecuta `batchHandler` por cada batch de items, de forma secuencial.
 *
 * - batchHandler recibe (itemsInBatch, batchIndex) y debe devolver Promise<void | R>
 * - retries aplica por batch si falla (catch)
 */
export async function runInBatches<T, R = void>(
  items: T[],
  batchHandler: (itemsInBatch: T[], batchIndex: number) => Promise<R>,
  opts: RunBatchesOptions<T> = {}
): Promise<BatchResult<T, R>[]> {
  const {
    batchSize = APP_CONSTANTS.apiHelpers.defaultBatchSize,
    delayBetweenBatchesMs = APP_CONSTANTS.apiHelpers.defaultDelayBetweenBatches,
    retries = APP_CONSTANTS.apiHelpers.defaultRetries,
    retryDelayMs = APP_CONSTANTS.apiHelpers.defaultRetryDelay,
    onError
  } = opts;

  const batches = chunkArray(items, batchSize);
  const results: BatchResult<T, R>[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    let attempt = 0;
    let succeeded = false;
    let lastError: unknown = undefined;

    while (attempt <= retries && !succeeded) {
      try {
        const batchResult = await batchHandler(batch, i);
        succeeded = true;
        results.push({ batchIndex: i, items: batch, success: true, batchResult: batchResult as R[] });
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt <= retries) {
          // espera antes del siguiente intento
          await new Promise((res) => setTimeout(res, retryDelayMs));
        }
      }
    }

    if (!succeeded) {
      results.push({ batchIndex: i, items: batch, success: false, error: lastError, batchResult: [] as R[] });
      if (onError) {
        try { await onError(lastError, i, batch); } catch {}
      } else {
        // si no hay onError, propaga para que el llamador decida
        throw lastError;
      }
    }

    if (delayBetweenBatchesMs > 0 && i < batches.length - 1) {
      await new Promise((res) => setTimeout(res, delayBetweenBatchesMs));
    }
  }

  return results;
}

/**
 * Safe API Call - Handles rate limiting with exponential backoff retries
 * 
 * Wraps async function calls with automatic retry logic for rate limit errors (HTTP 429).
 * Uses exponential backoff strategy: waits 2s, 4s, 8s, 16s, 32s between retries.
 * 
 * @param fn - Async function to execute
 * @param retries - Maximum number of retries (default: 5)
 * @param initialRetries - Internal parameter for tracking initial retry count (used in recursive calls)
 * @param rateLimitTracker - Optional object to track when rate limits occur (mutated internally)
 * @param globalRateLimitState - Shared state to coordinate cooldowns across callers
 * @returns Promise with the result of the function call
 * @throws Error if max retries exceeded or non-rate-limit error occurs
 * 
 * @example
 * const result = await safeCall(async () => {
 *   return await apiCall();
 * });
 * 
 * @example
 * const result = await safeCall(async () => {
 *   return await generateResponse(...);
 * }, 3); // Only 3 retries
 * 
 * @example
 * const rateLimitTracker = { hasRateLimit: false };
 * const result = await safeCall(async () => {
 *   return await apiCall();
 * }, 5, undefined, rateLimitTracker);
 * if (rateLimitTracker.hasRateLimit) {
 *   // Handle rate limit occurred
 * }
 *
 * @example
 * const globalState = { cooldownUntil: 0 };
 * await safeCall(apiCall, 5, undefined, tracker, globalState);
 */
export interface GlobalRateLimitState {
  /**
   * Timestamp (in ms) indicating when new requests can resume safely.
   */
  cooldownUntil: number
}

const RETRY_AFTER_BUFFER_MS = APP_CONSTANTS.apiHelpers.retryAfterBufferMs

/**
 * Waits until the global cooldown expires before allowing new API calls.
 * @param globalRateLimitState - Shared object storing the cooldown timestamp
 * @param context - Optional context label for logging
 */
export async function waitForGlobalCooldown(
  globalRateLimitState?: GlobalRateLimitState,
  context?: string
): Promise<void> {
  if (!globalRateLimitState) {
    return
  }

  let hasLogged = false

  while (true) {
    const remaining = globalRateLimitState.cooldownUntil - Date.now()
    if (remaining <= 0) {
      break
    }
    if (!hasLogged) {
      logger.debug(
        `${context ? `[${context}] ` : ''}Global rate limit cooldown active, waiting ${remaining}ms`
      )
      hasLogged = true
    }
    // wait for the remaining time + random jitter up to 500ms
    await new Promise(resolve => setTimeout(resolve, remaining + Math.random() * 500))
  }
}

export async function safeCall<T>(
  fn: () => Promise<T>,
  retries: number = APP_CONSTANTS.apiHelpers.defaultSafeCallRetries,
  initialRetries?: number,
  rateLimitTracker?: { hasRateLimit: boolean },
  globalRateLimitState?: GlobalRateLimitState
): Promise<T> {
  // Track initial retries on first call for proper backoff calculation
  const maxRetries = initialRetries ?? retries;

  if (globalRateLimitState) {
    await waitForGlobalCooldown(globalRateLimitState, 'safeCall')
  }
  
  try {
    return await fn();
  } catch (e: unknown) {
    // Check if error has status property (typical for HTTP errors)
    const error = e as {
      status?: number
      statusCode?: number
      message?: string
      response?: { headers?: unknown }
      headers?: unknown
      responseHeaders?: unknown
      [key: string]: unknown
    }
    
    // Check for rate limit error (429) in multiple ways:
    // 1. Direct status property
    // 2. statusCode property
    // 3. Status code in error message (e.g., "OpenAI API request failed: 429")
    const isRateLimit = 
      error.status === 429 || 
      error.statusCode === 429 ||
      (typeof error.message === 'string' && (
        error.message.includes(': 429') || 
        error.message.includes('status: 429') ||
        error.message.match(/\b429\b/)
      ));
    
    if (isRateLimit) {
      // Mark that a rate limit occurred
      if (rateLimitTracker) {
        rateLimitTracker.hasRateLimit = true
      }

      if (globalRateLimitState) {
        const retryAfterDelay = resolveRetryAfterDelay(error)
        if (retryAfterDelay !== null) {
          const nextAllowedAt = Date.now() + retryAfterDelay + RETRY_AFTER_BUFFER_MS
          globalRateLimitState.cooldownUntil = Math.max(
            globalRateLimitState.cooldownUntil,
            nextAllowedAt
          )
          logger.debug(`Retry-After header detected. Pausing new calls for ${retryAfterDelay + RETRY_AFTER_BUFFER_MS}ms`)
        }
      }
      
      if (retries > 0) {
        // Exponential backoff: 2^(maxRetries - retries) * baseDelay
        // For 5 retries: 2s, 4s, 8s, 16s, 32s
        const attemptsMade = maxRetries - retries;
        const wait = Math.pow(2, attemptsMade) * APP_CONSTANTS.apiHelpers.exponentialBackoffBase;
        
        logger.debug(`Rate limit hit (429), retrying in ${wait}ms... (${retries} retries remaining)`);
        await new Promise((res) => setTimeout(res, wait));
        
        // Retry recursively and return the result if successful
        return safeCall(fn, retries - 1, maxRetries, rateLimitTracker, globalRateLimitState);
      } else {
        // Retries exhausted - throw a more descriptive error
        logger.error(`Rate limit hit (429) but all ${maxRetries} retries exhausted`);
        const rateLimitError = new Error(
          `Rate limit error (429): Maximum retries (${maxRetries}) exceeded. ${error.message || 'Please try again later.'}`
        );
        // Preserve original error properties
        if (error.status) (rateLimitError as { status?: number }).status = 429;
        if (error.statusCode) (rateLimitError as { statusCode?: number }).statusCode = 429;
        throw rateLimitError;
      }
    }
    
    // Re-throw if not a rate limit error
    throw e;
  }
}

function resolveRetryAfterDelay(error: {
  response?: { headers?: unknown }
  headers?: unknown
  responseHeaders?: unknown
}): number | null {
  const sources = [
    error.response?.headers,
    error.headers,
    error.responseHeaders
  ]

  for (const source of sources) {
    const value = readRetryAfterHeader(source)
    if (value) {
      const parsed = parseRetryAfterValue(value)
      if (parsed !== null) {
        return parsed
      }
    }
  }

  return null
}

function readRetryAfterHeader(source: unknown): string | null {
  if (!source) {
    return null
  }

  if (typeof (source as Headers)?.get === 'function') {
    const asHeaders = source as Headers
    return asHeaders.get('retry-after') ?? asHeaders.get('Retry-After')
  }

  if (source instanceof Map) {
    for (const [key, value] of source.entries()) {
      if (typeof value === 'string' && key.toLowerCase() === 'retry-after') {
        return value
      }
    }
  }

  if (typeof source === 'object') {
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (key.toLowerCase() !== 'retry-after') {
        continue
      }

      if (typeof value === 'string') {
        return value
      }

      if (Array.isArray(value)) {
        const stringValue = value.find((item): item is string => typeof item === 'string')
        if (stringValue) {
          return stringValue
        }
      }

      if (typeof value === 'number') {
        return value.toString()
      }
    }
  }

  return null
}

function parseRetryAfterValue(value: string): number | null {
  const numeric = Number(value)
  if (!Number.isNaN(numeric)) {
    return Math.max(0, numeric) * 1000
  }

  const parsedDate = Date.parse(value)
  if (!Number.isNaN(parsedDate)) {
    const delta = parsedDate - Date.now()
    return delta > 0 ? delta : 0
  }

  return null
}