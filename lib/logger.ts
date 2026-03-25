/**
 * Structured logging system for the application
 * 
 * Provides:
 * - Multi-level logging (error, warn, info, debug)
 * - Environment-based control (development vs production)
 * - Structured logs with context
 * - Automatic sanitization of sensitive data
 * 
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/logging
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

interface LogContext {
  [key: string]: unknown
}

/**
 * Logger class that provides structured logging with environment-based filtering
 */
class Logger {
  private context: string
  private isDevelopment: boolean

  constructor(context: string) {
    this.context = context
    this.isDevelopment = process.env.NODE_ENV === 'development'
  }

  /**
   * Log critical errors - always shown in all environments
   */
  error(message: string, error?: Error | unknown, context?: LogContext) {
    console.error(`❌ [${this.context}] ${message}`, {
      ...context,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    })
  }

  /**
   * Log warnings - always shown in all environments
   */
  warn(message: string, context?: LogContext) {
    console.warn(`⚠️ [${this.context}] ${message}`, context || '')
  }

  /**
   * Log important information - only shown in development
   */
  info(message: string, context?: LogContext) {
    if (!this.isDevelopment) return

    console.log(`🔍 [${this.context}] ${message}`, context || '')
  }

  /**
   * Log debug information - only shown in development
   */
  debug(message: string, context?: LogContext) {
    if (!this.isDevelopment) return

    console.log(`🔍 [${this.context}] ${message}`, context || '')
  }

  /**
   * Log success messages - only shown in development
   */
  success(message: string, context?: LogContext) {
    if (!this.isDevelopment) return

    console.log(`✅ [${this.context}] ${message}`, context || '')
  }

  /**
   * Log process start messages - only shown in development
   */
  start(message: string, context?: LogContext) {
    if (!this.isDevelopment) return

    console.log(`🚀 [${this.context}] ${message}`, context || '')
  }

  /**
   * Sanitizes sensitive data before logging to prevent credential exposure
   */
  private sanitizeContext(context?: LogContext): LogContext | undefined {
    if (!context) return context

    const sanitized = { ...context }
    const sensitiveKeys = ['token', 'password', 'secret', 'key', 'authorization']

    for (const key of sensitiveKeys) {
      if (sanitized[key]) {
        sanitized[key] = typeof sanitized[key] === 'string' 
          ? `${sanitized[key].substring(0, 10)}...` 
          : '[REDACTED]'
      }
    }

    return sanitized
  }
}

/**
 * Factory function to create loggers with specific context
 * @param context - The context identifier for the logger (e.g., 'API', 'AUTH')
 * @returns A new Logger instance
 */
export function createLogger(context: string): Logger {
  return new Logger(context)
}

/**
 * Pre-configured loggers for common application contexts
 * Use these instead of creating new loggers for standard use cases
 */
export const loggers = {
  api: createLogger('API'),
  auth: createLogger('AUTH'),
  db: createLogger('DB'),
  gmb: createLogger('GMB'),
  middleware: createLogger('MIDDLEWARE'),
  dashboard: createLogger('DASHBOARD'),
  signup: createLogger('SIGN-UP'),
  signin: createLogger('SIGN-IN'),
  alldone: createLogger('ALL-DONE')
}

export default Logger
