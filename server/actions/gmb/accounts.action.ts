/**
 * GMB Accounts Actions - Server Actions for Google My Business Accounts
 * 
 * This file contains server actions for handling operations related to
 * Google My Business accounts. Includes functions to fetch, sync and
 * process accounts with their associated connections.
 * 
 * Main functionalities:
 * - Get Google My Business accounts by user
 * - Sync accounts with local database (connections table)
 * - Create connections without checking for existing ones
 * - Error handling and structured responses
 * - End-to-end orchestration of the sync process
 */

'use server'

import { GmbAccountsModel, type GoogleMyBusinessAccount } from '../../models/gmb/accounts.model'
import { GmbLocationsModel } from '../../models/gmb/locations.model'
import { GmbPubSubModel } from '../../models/gmb/pub-sub.model'
import { ConnectionsModel } from '../../models/supabase/connections.model'
import { UsersModel } from '../../models/supabase/users.model'
import type { connections, users, organizations } from '../../../app/generated/prisma'
import { createLogger } from '@/lib/logger'
import type { User } from '@clerk/nextjs/server'
import { getGoogleAccessToken } from '../clerk/users.action'
import { syncGoogleLocationsToLocations } from './locations.action'
import { LocationsModel } from '@/server/models/supabase/locations.model'
import { runInBatches } from '@/lib/api-helpers'
import { requireServerActionUser } from '@/lib/server-action-auth'

export interface GoogleScopeValidation {
  hasBusinessManage: boolean
  hasBasicScope: boolean
  missingScopes: string[]
}

const logger = createLogger('GMB-ACCOUNTS')

async function isAuthenticatedClerkUser(clerkUserId: string): Promise<boolean> {
  const { clerkUserId: authenticatedClerkUserId } = await requireServerActionUser()
  return authenticatedClerkUserId === clerkUserId
}

export interface ProcessAccountsResult {
  accounts: GoogleMyBusinessAccount[]
  totalAccounts: number
  connections: {
    created: connections[]
    existing: connections[]
    total: number
  }
  message: string
}

export interface GetUserConnectionsResult {
  connections: connections[]
  totalConnections: number
}

export interface SyncResult {
  created: connections[]
}

async function getUserConnectionsHelper(clerkUserId: string) {
  const dbUser = await UsersModel.findUserByClerkId(clerkUserId)
  if (!dbUser) {
    throw new Error('User not found in database')
  }

  const connections = await ConnectionsModel.findUserConnections(dbUser.id)
  return {
    connections,
    totalConnections: connections.length
  }
}

export async function syncGoogleAccountsToConnections({
  accounts,
  dbUser,
  organization
}: {
  accounts: GoogleMyBusinessAccount[]
  dbUser: users
  organization: organizations
}): Promise<SyncResult> {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    logger.debug('No accounts to sync')
    return { created: [] }
  }

  // Extract account IDs and prepare data for creation
  const allAccountsData = accounts
    .filter(a => a?.name)
    .map(a => {
      const externalId = String(a.name)
      const accountType = a.type || 'UNKNOWN'
      const truncatedType = accountType.length > 90 ? accountType.substring(0, 90) : accountType
      return {
        organization_id: organization.id,
        user_id: dbUser.id,
        provider: 'google' as const,
        external_account_id: externalId,
        type: truncatedType
      }
    })

  if (allAccountsData.length === 0) {
    logger.debug('No valid accounts to create')
    return { created: [] }
  }

  try {
    const externalIds = allAccountsData.map(a => a.external_account_id)
    const existingConnections = await ConnectionsModel.findConnectionsByOrganizationAndExternalIds(
      organization.id,
      externalIds
    )
    const existingExternalIds = new Set(existingConnections.map(c => c.external_account_id))
    const accountsToCreate = allAccountsData.filter(a => !existingExternalIds.has(a.external_account_id))

    if (accountsToCreate.length === 0) {
      logger.debug('All connections already exist, skipping creation', {
        externalIds,
        organizationId: organization.id
      })
      return { created: [] }
    }

    await ConnectionsModel.createManyConnections(accountsToCreate)

    const createdExternalIds = accountsToCreate.map(a => a.external_account_id)
    const createdConnections = await ConnectionsModel.findConnectionsByExternalIds(createdExternalIds)

    logger.debug('Sync completed', {
      created: createdConnections.length,
      skipped: existingExternalIds.size
    })

    return {
      created: createdConnections
    }
  } catch (err) {
    logger.error('Error creating accounts to connections', err)
    throw err
  }
}

/**
 * Server action to process Google My Business accounts
 * @param accessToken - Google access token
 * @param clerkUserId - User ID in Clerk
 * @returns Account processing result
 */
export async function processGoogleAccounts(
  accessToken: string,
  clerkUserId: string
): Promise<ProcessAccountsResult> {
  try {
    const isAuthorized = await isAuthenticatedClerkUser(clerkUserId)
    if (!isAuthorized) {
      return {
        accounts: [],
        totalAccounts: 0,
        connections: {
          created: [],
          existing: [],
          total: 0
        },
        message: 'Unauthorized user access'
      }
    }

    logger.start('Processing Google accounts for user', { userId: clerkUserId })
    
    // Fetch accounts from Google API
    const data = await GmbAccountsModel.fetchGoogleAccounts(accessToken)
    logger.debug('Successful response from Google API', { accountsCount: data.accounts?.length || 0 })

    if (!data.accounts || data.accounts.length === 0) {
      return {
        accounts: [],
        totalAccounts: 0,
        connections: {
          created: [],
          existing: [],
          total: 0
        },
        message: 'No Google My Business accounts found'
      }
    }

    try {
      // Get user and organization
      const { user: dbUser, organization } = await UsersModel.getUserAndOrganization(clerkUserId)

      // Sync accounts to connections
      const { created } = await syncGoogleAccountsToConnections({
        accounts: data.accounts,
        dbUser,
        organization
      })

      logger.debug('Batch sync completed', {
        created: created.length
      })

      return {
        accounts: data.accounts,
        totalAccounts: data.accounts.length,
        connections: {
          created,
          existing: [],
          total: created.length
        },
        message: `Processed ${data.accounts.length} accounts. ${created.length} connections created.`
      }

    } catch (dbError) {
      logger.error('Error processing connections in database', dbError)
      // Return accounts even if DB processing fails
      return {
        accounts: data.accounts,
        totalAccounts: data.accounts.length,
        connections: {
          created: [],
          existing: [],
          total: 0
        },
        message: 'Account IDs retrieved but error processing connections'
      }
    }
  } catch (error) {
    logger.error('Error in processGoogleAccounts server action:', error)
    
    // Return a structured error response
    return {
      accounts: [],
      totalAccounts: 0,
      connections: {
        created: [],
        existing: [],
        total: 0
      },
      message: error instanceof Error ? error.message : 'Unknown error processing accounts'
    }
  }
}

/**
 * Server action to get user connections
 * @param clerkUserId - User ID in Clerk
 * @returns User connections
 */
export async function getUserConnections(
  clerkUserId: string
): Promise<GetUserConnectionsResult> {
  try {
    const isAuthorized = await isAuthenticatedClerkUser(clerkUserId)
    if (!isAuthorized) {
      return {
        connections: [],
        totalConnections: 0
      }
    }

    logger.debug('Getting user connections for', { userId: clerkUserId })
    
    const result = await getUserConnectionsHelper(clerkUserId)
    
    return result
  } catch (error) {
    logger.error('Error in getUserConnections server action:', error)
    
    // Return empty result on error
    return {
      connections: [],
      totalConnections: 0
    }
  }
}

/**
 * Server action to fetch Google My Business accounts directly
 * @param accessToken - Google access token
 * @returns Google My Business accounts
 */
export async function fetchGoogleAccounts(
  accessToken: string
): Promise<{ accounts: GoogleMyBusinessAccount[]; totalAccounts: number }> {
  try {
    logger.debug('Fetching Google accounts directly')
    
    const result = await GmbAccountsModel.fetchGoogleAccounts(accessToken)
    
    return {
      accounts: result.accounts || [],
      totalAccounts: result.accounts?.length || 0
    }
  } catch (error) {
    logger.error('Error in fetchGoogleAccounts server action:', error)
    
    return {
      accounts: [],
      totalAccounts: 0
    }
  }
}


/**
 * Valida los scopes de Google OAuth del usuario
 */
export async function validateGoogleScopes(user: User): Promise<GoogleScopeValidation> {
  const userExists = await UsersModel.findUserByClerkId(user.id)
  if (!userExists) {
    return {
      hasBusinessManage: false,
      hasBasicScope: false,
      missingScopes: [
        'https://www.googleapis.com/auth/business.manage',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ]
    }
  }

  const googleAccount = user.externalAccounts?.find((ea) => 
    ea.provider === 'google' || ea.provider === 'oauth_google'
  )
  
  const approvedScopes = (googleAccount?.approvedScopes as unknown as string[]) || []
  
  const requiredScopes = [
    'https://www.googleapis.com/auth/business.manage',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ]
  
  const hasBusinessManage = approvedScopes.includes('https://www.googleapis.com/auth/business.manage')
  const hasBasicScope = approvedScopes.includes('https://www.googleapis.com/auth/userinfo.email')
  
  const missingScopes = requiredScopes.filter(scope => !approvedScopes.includes(scope))
  
  return {
    hasBusinessManage,
    hasBasicScope,
    missingScopes
  }
}

/**
 * Verifica si el usuario tiene una cuenta de Google válida
 */
export async function hasValidGoogleAccount(user: User): Promise<boolean> {
  const userExists = await UsersModel.findUserByClerkId(user.id)
  if (!userExists) return false

  const googleAccount = user.externalAccounts?.find((ea) => 
    ea.provider === 'google' || ea.provider === 'oauth_google'
  )
  
  if (!googleAccount) return false
  
  const validation = await validateGoogleScopes(user)
  return validation.hasBusinessManage
}

export async function getGoogleAccountInfo(user: User) {
  const userExists = await UsersModel.findUserByClerkId(user.id)
  if (!userExists) return null

  const googleAccount = user.externalAccounts?.find((ea) => 
    ea.provider === 'google' || ea.provider === 'oauth_google'
  )
  
  if (!googleAccount) return null
  
  return {
    provider: googleAccount.provider,
    externalId: googleAccount.externalId,
    approvedScopes: googleAccount.approvedScopes,
    email: googleAccount.emailAddress,
    firstName: googleAccount.firstName,
    lastName: googleAccount.lastName,
    avatarUrl: (googleAccount as unknown as { avatarUrl?: string }).avatarUrl
  }
}

/**
 * sync all google accounts for a user and locations for each account
 * @param userIdOrUser - Clerk user ID or User object
 * @param googleAccessToken - Optional pre-fetched Google access token (recommended for API routes)
 */
export async function syncAllGoogleAccountsWithLocations(clerk_id: string): Promise<{ success: boolean, accountsCount: number, locationsCount: number, message: string }> {
  let user: users | null = null
  // Get user from database
  if (typeof clerk_id === 'string') {
    user = await UsersModel.findUserByClerkId(clerk_id)
    if (!user || !user.id) {
      logger.error('User not found or missing id', { clerk_id })
      return { success: false, accountsCount: 0, locationsCount: 0, message: 'User not found or missing id' }
    }
  } else {
    logger.error('User not found or missing id', { clerk_id })
    return { success: false, accountsCount: 0, locationsCount: 0, message: 'User not found or missing id' }
  }
  
  /** get access token */
  const accessToken = await getGoogleAccessToken(clerk_id)
  if (!accessToken.success || !accessToken.token) return { success: false, accountsCount: 0, locationsCount: 0, message: 'Failed to get Google access token' }
  /** get all google accounts */
  logger.debug('Fetching Google accounts from GMB API')
  const googleAccounts = await GmbAccountsModel.fetchGoogleAccounts(accessToken.token)
  if (!googleAccounts.accounts || googleAccounts.accounts.length === 0) {
    logger.warn('No Google accounts found')
    return { success: false, accountsCount: 0, locationsCount: 0, message: 'No Google My Business accounts found' }
  }
  logger.info('Google accounts fetched', { count: googleAccounts.accounts.length })
  
  /** get user and organization */
  const { user: dbUser, organization } = await UsersModel.getUserAndOrganization(clerk_id)
  if (!dbUser || !organization) {
    logger.error('User not found or missing organization', { clerk_id })
    return { success: false, accountsCount: 0, locationsCount: 0, message: 'User not found or missing organization' }
  }
  /** sync google accounts to connections in batches of 10*/
  const syncResults = await runInBatches(
    googleAccounts.accounts,
    async (itemsInBatch) => {
      return await syncGoogleAccountsToConnections({
        accounts: itemsInBatch,
        dbUser,
        organization
      })
    },
    { batchSize: 15 }
  )

  /** get all google accounts locations with promise all*/
  const concatSyncResults = syncResults.map(result => result.batchResult as SyncResult[]).flat()

  const allConnections = concatSyncResults.map(result => result.created).flat()

  const locations = await Promise.all(allConnections.map(async (connection) => {
    const locations = await GmbLocationsModel.fetchLocationsForConnection(
      { id: connection.id as string, external_account_id: connection.external_account_id as string },
      accessToken.token as string
    )
    return { ...connection, locations }
  }))

  // Log locations count
  const allLocationsFlat = locations.map(location => location.locations).flat()
  logger.info('Locations received from Google', {
    totalLocations: allLocationsFlat.length
  })

  // sync google locations to locations with create many in batches of 10
  const syncGoogleLocations = await runInBatches(
    locations.map(location => location.locations).flat(),
    async (itemsInBatch) => {
      return await syncGoogleLocationsToLocations({
        locations: itemsInBatch,
        dbUser
      })
    },
    { batchSize: 20 }
  )

  logger.debug('Sync completed', {
    accountsBatchesProcessed: syncResults.length,
    locationsBatchesProcessed: syncGoogleLocations.length,
  })

  // Return only serializable data (no Prisma Decimal objects)
  return {
    success: true,
    accountsCount: googleAccounts.accounts.length,
    locationsCount: locations.map(location => location.locations).flat().length,
    message: 'Sync completed successfully'
  }
}

/**
 * Subscribes active Google connections to Google Pub/Sub and marks `pub_sub` as true.
 */
export async function subscribeAccountToGooglePubSub(userId: string) {
  /** Get user from database to obtain clerk_id */
  const dbUser = await UsersModel.findUserById(userId)
  if (!dbUser || !dbUser.clerk_id) {
    logger.error('User not found or missing clerk_id', { userId })
    return
  }
  
  /** Get all active locations created by this user with their connections */
  const locations = await LocationsModel.findActiveLocations(userId)
  if (!locations || locations.length === 0) {
    logger.warn('No active locations found for user', { userId })
    return
  }
  
  const googleAccounts = locations.map(location => location.connections.external_account_id)
  // delete duplicates
  const uniqueGoogleAccounts = [...new Set(googleAccounts)]
  
  /** Get access token using clerk_id */
  const accessToken = await getGoogleAccessToken(dbUser.clerk_id)
  if (!accessToken.success || !accessToken.token) {
    logger.error('Failed to get Google access token', { userId, clerkId: dbUser.clerk_id, accessToken: accessToken.token, error: accessToken.error})
    return
  }
  
  /** Subscribe each account to Google pub/sub */
  logger.info('Subscribing accounts to Google pub/sub', { 
    userId, 
    accountsCount: uniqueGoogleAccounts.length 
  })
  
  await Promise.all(uniqueGoogleAccounts.map(async (googleAccount) => {
    try {
      await GmbPubSubModel.subscribeAccountToGooglePubSub(googleAccount as string, accessToken.token as string)
      logger.debug('Account subscribed successfully', { googleAccount })
    } catch (error) {
      logger.error('Failed to subscribe account', { googleAccount, error })
    }
  }))

  // set pub_sub of all connections to true with the external_account_id with one query
  await ConnectionsModel.updateManyConnectionsByExternalId(
    uniqueGoogleAccounts.map(googleAccount => ({
      external_account_id: googleAccount,
      data: { pub_sub: true } as Partial<Omit<connections, 'id' | 'created_at' | 'updated_at'>>
    }))
  )
  
  logger.info('Pub/sub subscription completed', { userId, accountsCount: uniqueGoogleAccounts.length })
}