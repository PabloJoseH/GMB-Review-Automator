/**
 * API Response Types
 * 
 * Generic types for API responses following best practices.
 * These types wrap Prisma-generated types for consistent API responses.
 * 
 * Best Practices:
 * - Reuse Prisma-generated types for data
 * - Consistent pagination structure
 * - Clear success/error handling
 * - Type-safe across all actions
 */

/**
 * Standard pagination metadata
 * Used across all paginated endpoints
 */
export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

/**
 * Generic API response wrapper
 * Provides consistent structure for all API responses
 * 
 * @template T - The data type (usually Prisma-generated)
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message: string
  error?: string
}

/**
 * Paginated API response
 * Combines ApiResponse with pagination metadata
 * 
 * @template T - The data type (usually an array of Prisma-generated types)
 */
export interface PaginatedApiResponse<T = unknown> extends ApiResponse<T> {
  pagination: PaginationMeta
}

