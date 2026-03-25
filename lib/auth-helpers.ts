/**
 * Auth Helpers - Centralized Authentication Logic
 * 
 * This module provides centralized functions for handling authentication
 * across onboarding pages. It eliminates code duplication and ensures
 * consistent authentication behavior.
 * 
 * Key features:
 * - Centralized Clerk authentication validation
 * - Consistent user data retrieval
 * - Unified error handling and redirects
 * - Type-safe authentication results
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from '@/i18n/navigation'
import { getUserByClerkId } from '@/server/actions/supabase/users.action'
import type { User } from '@clerk/nextjs/server'
import type { users } from '@/app/generated/prisma'
import { createLogger } from '@/lib/logger'
import { getGoogleAccessToken } from '@/server/actions/clerk/users.action'
import { ClerkOrganizationMembershipsModel } from '@/server/models/clerk/organizationMemberships.model'

const logger = createLogger('AUTH-HELPERS')

/**
 * Result of authentication validation
 */
export interface AuthenticatedUser {
  clerkUser: User
  dbUser: users
  clerkUserId: string
  error?: string
}

/**
 * Gets authenticated user with full validation
 * 
 * This function centralizes the authentication flow:
 * 1. Validates Clerk authentication
 * 2. Gets current user from Clerk
 * 3. Finds user in database
 * 4. Handles all error cases with appropriate redirects
 * 
 * @param locale - Current locale for redirects
 * @returns Authenticated user data
 * @throws Redirects to sign-in if authentication fails
 */
export async function getAuthenticatedUser(locale: string, redirectUrl?: string): Promise<AuthenticatedUser> {
  try {
    // Step 1: Validate Clerk authentication
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      logger.warn('Unauthenticated access attempt', { locale, redirectUrl })
      // Include redirect param in sign-in URL if provided
      const signInUrl = redirectUrl 
        ? `/sign-in?redirect=${encodeURIComponent(redirectUrl)}`
        : '/sign-in'
      return redirect({ href: signInUrl, locale })
    }

    // Get Clerk user and database user in parallel
    // Use server action getUserByClerkId to follow architecture: helper → action → model → DB
    const [clerkUser, userResult] = await Promise.all([
      currentUser(),
      getUserByClerkId(clerkUserId)
    ])

    // Step 2: Get current user from Clerk
    if (!clerkUser) {
      logger.warn('No Clerk user found for authenticated user', { 
        clerkUserId, 
        locale 
      })
      return redirect({ href: '/sign-in', locale })
    }

    // Step 3: Find user in database using server action result
    if (!userResult.success || !userResult.data) {
      logger.debug('User not found in database', { 
        clerkUserId, 
        locale,
        error: userResult.error
      })
      // Return with dbUser = empty object to indicate error
      return {
        clerkUser,
        dbUser: {} as users,
        clerkUserId,
        error: userResult.error || 'User not found in database'
      }
    }

    const dbUser = userResult.data

    logger.debug('User authenticated successfully', {
      clerkUserId,
      dbUserId: dbUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress,
      onboardingStatus: dbUser.onboarding_status
    })

    return {
      clerkUser,
      dbUser,
      clerkUserId,
    }

  } catch (error) {
    // Check if this is a Next.js redirect (not a real error)
    if (error && typeof error === 'object' && 'digest' in error && 
        typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) {
      throw error // Re-throw redirect errors
    }
    
    logger.error('Error in getAuthenticatedUser', error, { locale })
    return redirect({ href: '/sign-in', locale })
  }
}

/**
 * Validates that user has completed sign-up (has clerk_id in database)
 * 
 * @param dbUser - User object from database
 * @param locale - Current locale for redirects
 * @throws Redirects to sign-up if user hasn't completed registration
 */
export function validateUserRegistration(dbUser: users, locale: string): void {
  if (!dbUser.clerk_id) {
    logger.warn('User accessed protected page without completing registration', {
      userId: dbUser.id,
      locale
    })
    redirect({ href: `/sign-up?u=${dbUser.id}`, locale })
  }
}

/**
 * Validates that user has an organization (required for certain steps)
 * 
 * @param dbUser - User object from database
 * @param locale - Current locale for redirects
 * @param redirectTo - Where to redirect if no organization (default: step-1)
 * @throws Redirects if user doesn't have organization
 */
export function validateUserOrganization(
  dbUser: users, 
  locale: string, 
  redirectTo: string = 'welcome'
): void {
  if (!dbUser.organization_id) {
    logger.warn('User accessed step requiring organization without having one', {
      userId: dbUser.id,
      onboardingStatus: dbUser.onboarding_status,
      locale
    })
    if (redirectTo === 'welcome') {
      redirect({ href: '/onboarding', locale })
    } else {
      redirect({ href: `/onboarding/${redirectTo}`, locale })
    }
  }
}

/**
 * Gets user data for client components (serialized)
 * 
 * @param clerkUser - Clerk user object
 * @param dbUser - Database user object
 * @returns Serialized user data safe for client components
 */
export function serializeUserForClient(clerkUser: User, dbUser: users) {
  return {
    id: clerkUser.id,
    firstName: clerkUser.firstName,
    lastName: clerkUser.lastName,
    primaryEmailAddress: {
      emailAddress: clerkUser.primaryEmailAddress?.emailAddress
    },
    imageUrl: clerkUser.imageUrl,
    organizationId: dbUser.organization_id,
    onboardingStatus: dbUser.onboarding_status
  }
}

/**
 * Validates authentication and returns user data for onboarding pages
 * 
 * This is a convenience function that combines authentication validation
 * with onboarding-specific checks.
 * 
 * @param locale - Current locale
 * @param requireOrganization - Whether organization is required for this step
 * @returns Authenticated user data
 */
export async function getAuthenticatedUserForOnboarding(
  locale: string,
  requireOrganization: boolean = false
): Promise<AuthenticatedUser> {
  const { clerkUser, dbUser, clerkUserId } = await getAuthenticatedUser(locale)
  
  // Validate user has completed registration
  validateUserRegistration(dbUser, locale)
  
  // Validate organization if required
  if (requireOrganization) {
    validateUserOrganization(dbUser, locale)
  }
  
  return { clerkUser, dbUser, clerkUserId }
}

/**
 * Checks if there is a user error (user not found in database)
 * 
 * @param authResult - Result from getAuthenticatedUser
 * @returns true if there is an error, false otherwise
 */
export function hasUserDatabaseError(authResult: AuthenticatedUser): boolean {
  return authResult.error !== undefined || !authResult.dbUser || !authResult.dbUser.id
}

/**
 * Gets safe user data with fallbacks for missing values
 * Uses Supabase user data (name, lastname, email) instead of Clerk data
 * 
 * @param authResult - Result from getAuthenticatedUser
 * @returns Serialized user data with safe defaults from Supabase
 */
export function getSafeUserData(authResult: AuthenticatedUser) {
  const { clerkUser, dbUser } = authResult
  // Use Supabase data (dbUser) as primary source, fallback to Clerk if needed
  const email = dbUser?.email || clerkUser?.primaryEmailAddress?.emailAddress
  return {
    id: dbUser?.id || clerkUser?.id || '',
    firstName: dbUser?.name || clerkUser?.firstName || null,
    lastName: dbUser?.lastname || clerkUser?.lastName || null,
    primaryEmailAddress: {
      emailAddress: email || undefined
    },
    imageUrl: clerkUser?.imageUrl || '',
    organizationId: dbUser?.organization_id || null
  }
}

/**
 * Validates that user has a valid Google access token with required scopes
 * 
 * This function ensures that the user has connected their Google account
 * and has a valid access token with the required Google My Business scopes.
 * If the token is invalid, missing, or lacks required scopes,
 * it redirects to sign-in page with the user ID and a specific error parameter.
 * 
 * Error types:
 * - expired_token: Token has expired
 * - invalid_token: Token is invalid or missing
 * - empty_token: Token is empty
 * - no_scopes: Token has no scopes
 * - missing_required_scope: Token is missing the required Google My Business scope
 * - validation_error: Error occurred during validation
 * 
 * @param clerkUserId - Clerk user ID
 * @param locale - Current locale for redirects
 * @throws Redirects to sign-in with userId and error query parameters
 */
export async function validateGoogleAccessToken(
  clerkUserId: string,
  locale: string
): Promise<void> {
  try {
    logger.info('Validating Google access token and scopes', { clerkUserId })
    
    const tokenResult = await getGoogleAccessToken(clerkUserId)
    
    // Check if token is invalid or missing
    if (!tokenResult.success) {
      const errorType = tokenResult.isExpired ? 'expired_token' : 'invalid_token'
      logger.warn('Invalid or missing Google access token', {
        clerkUserId,
        error: tokenResult.error,
        isExpired: tokenResult.isExpired,
        locale
      })
      return redirect({ href: `/sign-in?userId=${clerkUserId}&error=${errorType}`, locale })
    }
    
    // Check if token exists
    if (!tokenResult.token) {
      logger.warn('Google access token is empty', {
        clerkUserId,
        locale
      })
      return redirect({ href: `/sign-in?userId=${clerkUserId}&error=empty_token`, locale })
    }

    // Check if scopes exist
    if (!tokenResult.scopes || tokenResult.scopes.length === 0) {
      logger.warn('Google access token has no scopes', {
        clerkUserId,
        locale
      })
      return redirect({ href: `/sign-in?userId=${clerkUserId}&error=no_scopes`, locale })
    }

    // Check for required Google My Business scope
    const requiredScope = 'https://www.googleapis.com/auth/business.manage'
    const hasRequiredScope = tokenResult.scopes?.includes(requiredScope) ?? false
    
    if (!hasRequiredScope) {
      logger.warn('Google access token missing required Google My Business scope', {
        clerkUserId,
        requiredScope,
        availableScopes: tokenResult.scopes,
        locale
      })
      return redirect({ href: `/sign-in?userId=${clerkUserId}&error=missing_required_scope`, locale })
    }
    
    logger.success('Google access token and scopes validated successfully', { 
      clerkUserId,
      hasRequiredScope
    })
    
  } catch (error) {
    // Check if this is a Next.js redirect (not a real error)
    if (error && typeof error === 'object' && 'digest' in error && 
        typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) {
      throw error // Re-throw redirect errors
    }
    
    logger.error('Error validating Google access token', error, { 
      clerkUserId, 
      locale 
    })
    return redirect({ href: `/sign-in?userId=${clerkUserId}&error=validation_error`, locale })
  }
}

/**
 * Checks if a user is staff by verifying membership in internal organization
 * 
 * @param clerkId - Clerk user ID
 * @returns Promise<boolean> - true if user is staff, false otherwise
 */
export async function checkIfStaff(clerkId: string): Promise<boolean> {
  try {
    const internalOrgId =
      process.env.CLERK_INTERNAL_ORG_ID ??
      process.env.CLERK_INTERNAL_ORGANIZATION_ID ??
      process.env.CLERK_STAFF_ORG_ID

    if (!internalOrgId) {
      logger.warn('Missing staff organization env var', {
        clerkId,
        expected: ['CLERK_INTERNAL_ORG_ID', 'CLERK_INTERNAL_ORGANIZATION_ID', 'CLERK_STAFF_ORG_ID']
      })
      return false
    }

    const memberships = await ClerkOrganizationMembershipsModel.fetchMemberships(clerkId)
    return memberships.some((m) => m.organization?.id === internalOrgId)
  } catch (error) {
    logger.error('Error checking staff membership', error, { clerkId })
    return false
  }
}