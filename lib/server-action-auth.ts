/**
 * Server Action Authentication Helpers
 *
 * Provides centralized helpers to secure server actions by requiring
 * an authenticated Clerk user and exposing the active user identity.
 *
 * Key exports:
 * - `requireServerActionUser`: Ensures authenticated user for server actions.
 * - `getAuthenticatedDatabaseUserId`: Resolves authenticated database user id.
 * - `getAuthenticatedUserAccess`: Resolves authenticated user and organization data.
 * - `getAuthenticatedOrganizationAccess`: Resolves authenticated organization access.
 *
 * Relevant types:
 * - `ServerActionUser`: Shape for authenticated server action user data.
 * - `AuthenticatedDatabaseUser`: Shape for authenticated database user data.
 * - `AuthenticatedUserAccess`: Shape for authenticated user access data.
 * - `AuthenticatedOrganizationAccess`: Shape for authenticated organization access data.
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import type { User } from '@clerk/nextjs/server'
import { createLogger } from '@/lib/logger'
import { UsersModel } from '@/server/models/supabase/users.model'

const logger = createLogger('SERVER-ACTION-AUTH')

/**
 * Authenticated user data for server actions.
 */
export interface ServerActionUser {
  clerkUserId: string
  clerkUser: User
}

/**
 * Authenticated database user data for server actions.
 */
export interface AuthenticatedDatabaseUser {
  clerkUserId: string
  dbUserId: string
}

/**
 * Authenticated user access data for server actions.
 */
export interface AuthenticatedUserAccess {
  dbUserId: string
  organizationId: string | null
}

/**
 * Authenticated organization access data for server actions.
 */
export interface AuthenticatedOrganizationAccess {
  dbUserId: string
  organizationId: string
}

/**
 * Requires an authenticated Clerk user for a server action.
 *
 * @throws Error when authentication or user retrieval fails.
 */
export async function requireServerActionUser(): Promise<ServerActionUser> {
  const { userId } = await auth()

  if (!userId) {
    logger.warn('Unauthenticated server action access attempt')
    throw new Error('Unauthenticated server action access')
  }

  const clerkUser = await currentUser()
  if (!clerkUser) {
    logger.warn('Authenticated user not found in Clerk', { userId })
    throw new Error('Authenticated user not found')
  }

  return {
    clerkUserId: userId,
    clerkUser
  }
}

/**
 * Resolves the authenticated database user id for server actions.
 *
 * @throws Error when the database user is missing.
 */
export async function getAuthenticatedDatabaseUserId(): Promise<AuthenticatedDatabaseUser> {
  const { clerkUserId } = await requireServerActionUser()
  const dbUser = await UsersModel.findUserByClerkId(clerkUserId)

  if (!dbUser?.id) {
    logger.warn('Authenticated user not found in database', { clerkUserId })
    throw new Error('Authenticated user not found in database')
  }

  return { clerkUserId, dbUserId: dbUser.id }
}

/**
 * Resolves the authenticated user id and organization id.
 *
 * @throws Error when the database user is missing.
 */
export async function getAuthenticatedUserAccess(): Promise<AuthenticatedUserAccess> {
  const { clerkUserId } = await requireServerActionUser()
  const dbUser = await UsersModel.findUserByClerkId(clerkUserId)

  if (!dbUser?.id) {
    logger.warn('Authenticated user not found in database', { clerkUserId })
    throw new Error('Authenticated user not found in database')
  }

  return {
    dbUserId: dbUser.id,
    organizationId: dbUser.organization_id ?? null
  }
}

/**
 * Resolves the authenticated user id and requires organization access.
 *
 * @throws Error when the organization is missing.
 */
export async function getAuthenticatedOrganizationAccess(): Promise<AuthenticatedOrganizationAccess> {
  const access = await getAuthenticatedUserAccess()

  if (!access.organizationId) {
    logger.warn('Authenticated user has no organization', { dbUserId: access.dbUserId })
    throw new Error('Organization access required')
  }

  return {
    dbUserId: access.dbUserId,
    organizationId: access.organizationId
  }
}
