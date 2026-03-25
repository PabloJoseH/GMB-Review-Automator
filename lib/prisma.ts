/**
 * Prisma Client Configuration
 * 
 * This module exports a singleton Prisma client instance with:
 * - PostgreSQL adapter for connection pooling
 * - Global instance management to prevent multiple instances in development
 * - Connection pool statistics logging on startup
 * 
 * Main functionalities:
 * - Database connection pooling configuration via @prisma/adapter-pg
 * - Development mode optimization (single instance)
 * - Connection statistics and monitoring via instrumentation.ts
 * 
 * Connection Pool Configuration:
 * The connection pool size is managed by the @prisma/adapter-pg adapter.
 * To configure the pool size, add the connection_limit parameter to your DATABASE_URL:
 * 
 *   DATABASE_URL="postgresql://user:password@host:5432/db?connection_limit=10"
 * 
 * Default pool behavior:
 * - Without connection_limit: Uses adapter's default (typically 10)
 * - The adapter manages connection lifecycle and pooling automatically
 */

import { PrismaClient } from '../app/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create PostgreSQL adapter with connection pooling
// The adapter handles connection pooling based on DATABASE_URL parameters
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string
})

// Initialize Prisma client with PostgreSQL adapter
// Connection pool statistics are logged via instrumentation.ts on app startup
export const prisma = 
  globalForPrisma.prisma ??
  new PrismaClient({ 
    adapter
  })

// In development mode, reuse the same instance to avoid creating multiple connections
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
