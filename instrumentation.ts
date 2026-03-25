/**
 * Next.js Instrumentation File
 * 
 * This file runs once when the server starts (in production mode).
 * Used to initialize and log application-level configurations and connections.
 * 
 * In Next.js 16, this file is executed during the server startup phase.
 * 
 * Main functionalities:
 * - Prisma client connection statistics logging
 * - Database connection pool monitoring
 * - Application initialization diagnostics
 */

export async function register() {
  // Only run in production mode (in dev, this runs but we check environment)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { prisma } = await import('./lib/prisma')
    const { createLogger } = await import('./lib/logger')
    
    const logger = createLogger('INSTRUMENTATION')

    try {
      // Test database connection with a simple query
      const startTime = Date.now()
      await prisma.$queryRaw`SELECT 1 as test`
      const connectionTime = Date.now() - startTime
      
      // Get database connection pool configuration from DATABASE_URL
      const connectionPoolInfo = parseConnectionPoolFromUrl(process.env.DATABASE_URL || '')
      
      // Log detailed database connection information
      logger.debug('Prisma Client initialized - Database Connection Pool Statistics', {
        connectionTime: `${connectionTime}ms`,
        maxConnections: connectionPoolInfo.maxConnections,
        connectTimeout: connectionPoolInfo.connectTimeout,
        poolTimeout: connectionPoolInfo.poolTimeout,
      })
      
      // Graceful shutdown handler
      process.on('SIGINT', async () => {
        await cleanupPrisma(logger)
      })
      
      process.on('SIGTERM', async () => {
        await cleanupPrisma(logger)
      })

    } catch (error) {
      logger.error('Failed to initialize Prisma Client', error)
    }
  }
}

/**
 * Parse connection pool configuration from DATABASE_URL
 * PostgreSQL connection strings support pool parameters
 */
function parseConnectionPoolFromUrl(url: string): {
  maxConnections: string
  connectTimeout: string
  poolTimeout: string
} {
  const result = {
    maxConnections: 'default',
    connectTimeout: 'default',
    poolTimeout: 'default'
  }

  if (!url) {
    return result
  }

  try {
    const urlObj = new URL(url)
    
    // Extract pool size from connection_limit parameter
    if (urlObj.searchParams.has('connection_limit')) {
      result.maxConnections = urlObj.searchParams.get('connection_limit') || 'default'
    }
    
    // Extract connect timeout
    if (urlObj.searchParams.has('connect_timeout')) {
      result.connectTimeout = urlObj.searchParams.get('connect_timeout') || 'default'
    }
    
    // Extract pool timeout
    if (urlObj.searchParams.has('pool_timeout')) {
      result.poolTimeout = urlObj.searchParams.get('pool_timeout') || 'default'
    }
    
  } catch {
    // If URL parsing fails, try to extract from string
    const poolSizeMatch = url.match(/connection_limit=(\d+)/i)
    if (poolSizeMatch) {
      result.maxConnections = poolSizeMatch[1]
    }
  }

  return result
}

/**
 * Cleanup Prisma connection on application shutdown
 */
async function cleanupPrisma(logger: ReturnType<typeof import('./lib/logger').createLogger>) {
  logger.debug('Shutting down Prisma Client...')
  
  try {
    const { prisma } = await import('./lib/prisma')
    await prisma.$disconnect()
    logger.debug('Prisma Client disconnected gracefully')
  } catch (error) {
    logger.error('Error disconnecting Prisma Client', error)
  }
}

