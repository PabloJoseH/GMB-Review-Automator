/**
 * @fileoverview Subscriptions server actions for Supabase.
 *
 * @remarks
 * Handles subscription lifecycle operations, Stripe synchronization, and audit logs.
 *
 * Key exports:
 * - `findSubscriptionByOrganizationId`
 * - `upsertSubscription`
 * - `cancelSubscription`
 * - `recalculateSubscriptionLocationCount`
 * - `createSubscriptionLog`
 * - `getSubscriptionLogs`
 *
 * Relevant types:
 * - `StripeSubscriptionData` (alias PaddleSubscriptionData in model)
 */
'use server'

import Stripe from 'stripe'
import { SubscriptionsModel, type PaddleSubscriptionData } from '../../models/supabase/subscriptions.model'
import { createLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedOrganizationAccess, requireServerActionUser } from '@/lib/server-action-auth'
import { checkIfStaff } from '@/lib/auth-helpers'

const logger = createLogger('SUBSCRIPTIONS')
const stripeApiVersion = '2026-01-28.clover' as const

function getSubscriptionItemPeriodEndDate(stripeSubscription: Stripe.Subscription): Date | null {
  const firstItem = stripeSubscription.items?.data?.[0] as
    | { current_period_end?: unknown }
    | undefined
  const itemPeriodEnd = firstItem?.current_period_end
  if (typeof itemPeriodEnd === 'number' && Number.isFinite(itemPeriodEnd)) {
    return new Date(itemPeriodEnd * 1000)
  }
  return null
}

function getStripeClient(): Stripe | null {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) return null
  return new Stripe(secret, { apiVersion: stripeApiVersion })
}

async function getOrganizationAccessForAdmin() {
  const { clerkUserId } = await requireServerActionUser()
  const isStaff = await checkIfStaff(clerkUserId)

  if (isStaff) {
    return { isStaff }
  }

  const { organizationId } = await getAuthenticatedOrganizationAccess()
  return { isStaff, organizationId }
}

import type { subscriptions, subscription_change_type } from '../../../app/generated/prisma'

type TrialActivationResult = {
  success: boolean
  stripeUpdated: boolean
  nextBillingDate: Date | null
  error?: string
}

/**
 * Finish Stripe trial and activate subscription
 * - Ends trial immediately via Stripe API
 * - Updates quantity with current active locations
 * - Persists status, next billing date, and count in Supabase
 */
async function endTrialAndActivateSubscription(
  subscription: subscriptions,
  activeLocationsCount: number
): Promise<TrialActivationResult> {
  if (!subscription.stripe_subscription_id) {
    logger.warn('Cannot end trial without Stripe subscription ID', {
      subscriptionId: subscription.id,
      organizationId: subscription.organization_id
    })
    return {
      success: false,
      stripeUpdated: false,
      nextBillingDate: null,
      error: 'Missing Stripe subscription ID'
    }
  }

  const stripe = getStripeClient()
  if (!stripe) {
    logger.warn('Stripe not configured, updating DB only')
    const nextBillingDate = null
    await SubscriptionsModel.updateSubscription(subscription.id, {
      status: 'active',
      location_active_count: activeLocationsCount,
      periodEnd: nextBillingDate
    })
    return { success: true, stripeUpdated: false, nextBillingDate }
  }

  try {
    await stripe.subscriptions.update(subscription.stripe_subscription_id, { trial_end: 'now' })

    let stripeUpdated = false
    let nextBillingDate: Date | null = null
    try {
      const sub = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id)
      const itemId = sub.items?.data?.[0]?.id
      if (itemId) {
        await stripe.subscriptionItems.update(itemId, { quantity: activeLocationsCount })
        stripeUpdated = true
      }
      nextBillingDate = getSubscriptionItemPeriodEndDate(sub)
    } catch (error) {
      logger.warn('Failed to update Stripe quantity after ending trial', {
        subscriptionId: subscription.id,
        organizationId: subscription.organization_id,
        error
      })
    }

    await SubscriptionsModel.updateSubscription(subscription.id, {
      status: 'active',
      location_active_count: activeLocationsCount,
      periodEnd: nextBillingDate
    })

    logger.info('Subscription moved from trialing to active with updated quantity', {
      subscriptionId: subscription.id,
      organizationId: subscription.organization_id,
      newCount: activeLocationsCount,
      stripeUpdated
    })

    return {
      success: true,
      stripeUpdated,
      nextBillingDate
    }
  } catch (error) {
    logger.error('Error ending subscription trial', {
      subscriptionId: subscription.id,
      organizationId: subscription.organization_id,
      error
    })
    return {
      success: false,
      stripeUpdated: false,
      nextBillingDate: null,
      error: error instanceof Error ? error.message : 'Unknown error ending trial'
    }
  }
}

/**
 * Overview: Subscriptions actions for Prisma (Supabase)
 * - CRUD helpers for `subscriptions` table
 * - Lookups by organization ID and Stripe subscription ID
 * - Integrates with Stripe to manage subscriptions
 * 
 * IMPORTANT: All subscription update operations use immediate proration mode
 * - Changes are applied immediately (no waiting for next billing period)
 * - Prorated charges/credits are calculated and applied right away
 * - Users see the change and billing adjustment immediately
 * 
 * - Subscription cancellation: can be immediate or at end of billing period
 *   - Immediate cancellation: user loses access right away, no more charges (no automatic refund)
 *   - End of period cancellation: user keeps access until end of paid period, no more charges after
 * - Subscription logs: create and retrieve logs for subscription changes and scheduled changes
 */

/**
 * Find subscription by organization ID
 */
export async function findSubscriptionByOrganizationId(organizationId: string) {
  try {
    const { isStaff, organizationId: authenticatedOrganizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff && organizationId !== authenticatedOrganizationId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Finding subscription by organization ID', { organizationId })

    const subscription = await SubscriptionsModel.findSubscriptionByOrganizationId(organizationId)

    if (!subscription) {
      return {
        success: false,
        error: 'Subscription not found',
        message: 'No subscription found with this organization ID'
      }
    }
    
    logger.debug('Subscription retrieved successfully', { 
      subscriptionId: subscription.id,
      organizationId: subscription.organization_id,
    })

    return {
      success: true,
      data: subscription,
      message: 'Subscription retrieved successfully'
    }

  } catch (error) {
    logger.error('Error finding subscription by organization ID', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error finding subscription by organization ID',
      message: 'Error finding subscription by organization ID'
    }
  }
}

/**
 * Find subscription by Stripe subscription ID
 */
export async function findSubscriptionByPaddleSubscriptionId(paddleSubscriptionId: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    logger.debug('Finding subscription by Stripe ID', { stripeSubscriptionId: paddleSubscriptionId })

    const subscription = await SubscriptionsModel.findSubscriptionByPaddleId(paddleSubscriptionId)

    if (!subscription) {
      return {
        success: false,
        error: 'Subscription not found',
        message: 'No subscription found with this Stripe subscription ID'
      }
    }

    if (!isStaff && subscription.organization_id !== organizationId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }
    
    logger.debug('Subscription retrieved successfully', { 
      subscriptionId: subscription.id,
      stripeSubscriptionId: subscription.stripe_subscription_id,
      status: subscription.status,
    })

    return {
      success: true,
      data: subscription,
      message: 'Subscription retrieved successfully'
    }
    
  } catch (error) {
    logger.error('Error finding subscription by Stripe subscription ID', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error finding subscription by Stripe subscription ID',
      message: 'Error finding subscription by Stripe subscription ID'
    }
  }
}

/**
 * Upsert subscription
 */
export async function upsertSubscription(organizationId: string, subscriptionData: PaddleSubscriptionData) {
  try {
    const { isStaff, organizationId: authenticatedOrganizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff && organizationId !== authenticatedOrganizationId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Upserting subscription', { organizationId, subscriptionData })

    const subscription = await SubscriptionsModel.upsertSubscription(organizationId, subscriptionData)

    logger.debug('Subscription upserted successfully', { 
      subscriptionId: subscription.id,
      organizationId: subscription.organization_id,
      status: subscription.status,
    })

    return {
      success: true,
      data: subscription,
      message: 'Subscription upserted successfully'
    }

  } catch (error) {
    logger.error('Error upserting subscription', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error upserting subscription',
      message: 'Error upserting subscription'
    }
  }
}

/**
 * Cancel subscription
 * @param organizationId - Organization ID
 * @param subscriptionData - Subscription data with Stripe subscription ID
 * @param immediate - If true, cancels immediately. If false, cancels at end of billing period (default: true)
 */
export async function cancelSubscription(
  organizationId: string, 
  subscriptionData: PaddleSubscriptionData,
  immediate: boolean = true
) {
  try {
    const { isStaff, organizationId: authenticatedOrganizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff && organizationId !== authenticatedOrganizationId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Cancelling subscription', { organizationId, immediate })

    let nextBillingDate: Date | null = null
    const stripe = getStripeClient()
    if (stripe) {
      if (immediate) {
        const sub = await stripe.subscriptions.cancel(subscriptionData.id)
        nextBillingDate = getSubscriptionItemPeriodEndDate(sub)
      } else {
        await stripe.subscriptions.update(subscriptionData.id, { cancel_at_period_end: true })
        const sub = await stripe.subscriptions.retrieve(subscriptionData.id)
        nextBillingDate = getSubscriptionItemPeriodEndDate(sub)
      }
      logger.debug('Stripe cancellation processed', {
        organizationId,
        stripeSubscriptionId: subscriptionData.id,
        immediate
      })
    }

    const subscription = await SubscriptionsModel.cancelSubscription(organizationId, {
      id: subscriptionData.id,
      status: 'canceled',
      periodEnd: nextBillingDate,
    })

    if (!subscription) {
      return {
        success: false,
        error: 'Subscription not found',
        message: 'No subscription found with this organization ID'
      }
    }
    
    logger.debug('Subscription cancelled successfully', { 
      subscriptionId: subscription.id,
      organizationId: subscription.organization_id,
      status: subscription.status,
      immediate
    })

    return {
      success: true,
      data: subscription,
      message: `Subscription cancelled successfully (${immediate ? 'immediate' : 'at end of billing period'})`
    }

  } catch (error) {
    logger.error('Error cancelling subscription', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error cancelling subscription',
      message: 'Error cancelling subscription'
    }
  }
}

/**
 * Create subscription
 */
export async function createSubscription(subscriptionData: {
  organization_id: string,
  status: subscriptions['status'],
  stripe_subscription_id: string,
  periodEnd?: Date | null,
  location_active_count?: number
}) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff && subscriptionData.organization_id !== organizationId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Creating subscription', { organizationId: subscriptionData.organization_id })

    const subscription = await SubscriptionsModel.createSubscription(subscriptionData)

    logger.debug('Subscription created successfully', { 
      subscriptionId: subscription.id,
      organizationId: subscription.organization_id,
      status: subscription.status,
    })

    return {
      success: true,
      data: subscription,
      message: 'Subscription created successfully'
    }

  } catch (error) {
    logger.error('Error creating subscription', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error creating subscription',
      message: 'Error creating subscription'
    }
  }
}

/**
 * Update subscription
 */
export async function updateSubscription(id: string, subscriptionData: {
  organization_id: string,
  status: subscriptions['status'],
  stripe_subscription_id: string,
  location_active_count: number,
  periodEnd: Date | null
}) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff && subscriptionData.organization_id !== organizationId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Updating subscription', { id })

    const subscription = await SubscriptionsModel.updateSubscription(id, subscriptionData)

    if (!subscription) {
      return {
        success: false,
        error: 'Subscription not found',
        message: 'No subscription found with this ID'
      }
    }
    
    logger.debug('Subscription updated successfully', { 
      subscriptionId: subscription.id,
      organizationId: subscription.organization_id,
      status: subscription.status,
    })

    return {
      success: true,
      data: subscription,
      message: 'Subscription updated successfully'
    }

  } catch (error) {
    logger.error('Error updating subscription', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error updating subscription',
      message: 'Error updating subscription'
    }
  }
}

/**
 * Recalculate and update subscription location active count
 * Counts active locations for an organization and updates both Supabase and Stripe
 * This function should be called whenever locations are activated/deactivated
 * 
 * IMPORTANT: Updates use immediate proration mode
 * - Changes are applied immediately (no waiting for next billing period)
 * - Prorated charges/credits are calculated and applied right away
 * - Trial period is preserved: activating locations during trial does NOT end the trial
 * 
 * @param organizationId - The organization ID to recalculate for
 * @returns Success status with old and new counts
 */
export async function recalculateSubscriptionLocationCount(organizationId: string) {
  try {
    const { isStaff, organizationId: authenticatedOrganizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff && organizationId !== authenticatedOrganizationId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Recalculating subscription location count', { organizationId })

    // 1. Get subscription for this organization
    const subscription = await SubscriptionsModel.findSubscriptionByOrganizationId(organizationId)
    
    if (!subscription) {
      logger.debug('No subscription found for organization', { organizationId })
      return {
        success: false,
        error: 'Subscription not found',
        message: 'No subscription found for this organization',
        data: {
          updated: false,
          oldCount: 0,
          newCount: 0,
          trialEnded: false
        }
      }
    }

    // 2. Count active locations for this organization using Prisma
    // Locations are related through: organization -> connections -> locations
    const activeLocationsCount = await prisma.locations.count({
      where: {
        status: 'active',
        connections: {
          organization_id: organizationId
        }
      }
    })

    const oldCount = subscription.location_active_count

    // 3. Only update if count has changed
    if (activeLocationsCount === oldCount) {
      logger.debug('Location count unchanged, skipping update', {
        organizationId,
        count: activeLocationsCount
      })
      return {
        success: true,
        data: {
          updated: false,
          oldCount,
          newCount: activeLocationsCount,
          trialEnded: false
        },
        message: 'Location count unchanged'
      }
    }

    logger.info('Location count changed, updating subscription', {
      organizationId,
      oldCount,
      newCount: activeLocationsCount,
      stripeSubscriptionId: subscription.stripe_subscription_id
    })

    const stripe = getStripeClient()
    const shouldUpdateStripe =
      (subscription.status === 'active' || subscription.status === 'trialing') &&
      subscription.stripe_subscription_id &&
      stripe

    const [updatedSubscription, stripeUpdateResult] = await Promise.allSettled([
      SubscriptionsModel.updateSubscription(subscription.id, {
        location_active_count: activeLocationsCount
      }),
      shouldUpdateStripe
        ? (async () => {
            const sub = await stripe!.subscriptions.retrieve(subscription.stripe_subscription_id!)
            const itemId = sub.items?.data?.[0]?.id
            if (itemId) {
              return stripe!.subscriptionItems.update(itemId, { quantity: activeLocationsCount })
            }
            return null
          })()
        : Promise.resolve(null)
    ])

    if (updatedSubscription.status === 'rejected') {
      logger.error('Failed to update subscription in Supabase', {
        error: updatedSubscription.reason,
        organizationId
      })
      throw new Error(`Failed to update subscription: ${updatedSubscription.reason}`)
    }

    if (stripeUpdateResult.status === 'rejected') {
      logger.warn('Failed to update Stripe subscription, but Supabase was updated', {
        error: stripeUpdateResult.reason,
        organizationId,
        stripeSubscriptionId: subscription.stripe_subscription_id
      })
    } else if (stripeUpdateResult.status === 'fulfilled' && stripeUpdateResult.value !== null) {
      logger.info('Stripe subscription quantity updated successfully', {
        organizationId,
        stripeSubscriptionId: subscription.stripe_subscription_id,
        newQuantity: activeLocationsCount
      })
    }

    logger.info('Subscription location count recalculated successfully', {
      organizationId,
      oldCount,
      newCount: activeLocationsCount,
      stripeUpdated: stripeUpdateResult.status === 'fulfilled'
    })

    return {
      success: true,
      data: {
        updated: true,
        oldCount,
        newCount: activeLocationsCount,
        stripeUpdated: stripeUpdateResult.status === 'fulfilled',
        trialEnded: false
      },
      message: `Location count updated from ${oldCount} to ${activeLocationsCount}`
    }

  } catch (error) {
    logger.error('Error recalculating subscription location count', error, { organizationId })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error recalculating location count',
      message: 'Error recalculating subscription location count',
      data: {
        updated: false,
        oldCount: 0,
        newCount: 0,
        trialEnded: false
      }
    }
  }
}

/**
 * Internal: Recalculates subscription location count for an organization without auth.
 * Same logic as recalculateSubscriptionLocationCount (Stripe quantity + Supabase location_active_count).
 * Trial period is preserved: activating locations during trial does NOT end the trial.
 * For use only by trusted server code that has already validated the organization (e.g. updateMultipleLocationsStatusByIdsForUser).
 * Not for public or client-invoked use.
 *
 * @param organizationId - The organization ID to recalculate for
 * @returns Success status with old and new counts
 */
export async function recalculateSubscriptionLocationCountInternal(organizationId: string) {
  try {
    logger.debug('Recalculating subscription location count (internal)', { organizationId })

    const subscription = await SubscriptionsModel.findSubscriptionByOrganizationId(organizationId)

    if (!subscription) {
      logger.debug('No subscription found for organization', { organizationId })
      return {
        success: false,
        error: 'Subscription not found',
        message: 'No subscription found for this organization',
        data: {
          updated: false,
          oldCount: 0,
          newCount: 0,
          trialEnded: false
        }
      }
    }

    const activeLocationsCount = await prisma.locations.count({
      where: {
        status: 'active',
        connections: {
          organization_id: organizationId
        }
      }
    })

    const oldCount = subscription.location_active_count

    if (activeLocationsCount === oldCount) {
      logger.debug('Location count unchanged, skipping update', {
        organizationId,
        count: activeLocationsCount
      })
      return {
        success: true,
        data: {
          updated: false,
          oldCount,
          newCount: activeLocationsCount,
          trialEnded: false
        },
        message: 'Location count unchanged'
      }
    }

    logger.info('Location count changed, updating subscription (internal)', {
      organizationId,
      oldCount,
      newCount: activeLocationsCount,
      stripeSubscriptionId: subscription.stripe_subscription_id
    })

    const stripe = getStripeClient()
    const shouldUpdateStripe =
      (subscription.status === 'active' || subscription.status === 'trialing') &&
      subscription.stripe_subscription_id &&
      stripe

    const [updatedSubscription, stripeUpdateResult] = await Promise.allSettled([
      SubscriptionsModel.updateSubscription(subscription.id, {
        location_active_count: activeLocationsCount
      }),
      shouldUpdateStripe
        ? (async () => {
            const sub = await stripe!.subscriptions.retrieve(subscription.stripe_subscription_id!)
            const itemId = sub.items?.data?.[0]?.id
            if (itemId) {
              return stripe!.subscriptionItems.update(itemId, { quantity: activeLocationsCount })
            }
            return null
          })()
        : Promise.resolve(null)
    ])

    if (updatedSubscription.status === 'rejected') {
      logger.error('Failed to update subscription in Supabase (internal)', {
        error: updatedSubscription.reason,
        organizationId
      })
      throw new Error(`Failed to update subscription: ${updatedSubscription.reason}`)
    }

    if (stripeUpdateResult.status === 'rejected') {
      logger.warn('Failed to update Stripe subscription, but Supabase was updated', {
        error: stripeUpdateResult.reason,
        organizationId,
        stripeSubscriptionId: subscription.stripe_subscription_id
      })
    } else if (stripeUpdateResult.status === 'fulfilled' && stripeUpdateResult.value !== null) {
      logger.info('Stripe subscription quantity updated successfully (internal)', {
        organizationId,
        stripeSubscriptionId: subscription.stripe_subscription_id,
        newQuantity: activeLocationsCount
      })
    }

    logger.info('Subscription location count recalculated successfully (internal)', {
      organizationId,
      oldCount,
      newCount: activeLocationsCount,
      stripeUpdated: stripeUpdateResult.status === 'fulfilled'
    })

    return {
      success: true,
      data: {
        updated: true,
        oldCount,
        newCount: activeLocationsCount,
        stripeUpdated: stripeUpdateResult.status === 'fulfilled',
        trialEnded: false
      },
      message: `Location count updated from ${oldCount} to ${activeLocationsCount}`
    }
  } catch (error) {
    logger.error('Error recalculating subscription location count (internal)', error, { organizationId })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error recalculating location count',
      message: 'Error recalculating subscription location count',
      data: {
        updated: false,
        oldCount: 0,
        newCount: 0,
        trialEnded: false
      }
    }
  }
}

/**
 * Create subscription log
 * Records a change or scheduled change for a subscription
 */
export async function createSubscriptionLog(logData: {
  subscription_id: string
  change_type: subscription_change_type
  new_status?: string | null
  new_period_start?: Date | null
  new_period_end?: Date | null
  scheduled_for?: Date | null
}) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const subscription = await prisma.subscriptions.findFirst({
      where: isStaff
        ? { id: logData.subscription_id }
        : { id: logData.subscription_id, organization_id: organizationId },
      select: { id: true }
    })

    if (!subscription) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    const subscriptionLog = await prisma.subscription_logs.create({
      data: {
        subscription_id: logData.subscription_id,
        change_type: logData.change_type,
        new_status: logData.new_status ?? null,
        new_period_start: logData.new_period_start ?? null,
        new_period_end: logData.new_period_end ?? null,
        scheduled_for: logData.scheduled_for ?? null,
      }
    })

    return {
      success: true,
      data: subscriptionLog,
      message: 'Subscription log created successfully'
    }
  } catch (error) {
    logger.error('Error creating subscription log', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error creating subscription log',
      message: 'Error creating subscription log'
    }
  }
}

/**
 * Get subscription logs
 * Retrieves logs for a specific subscription, optionally filtered and ordered
 */
export async function getSubscriptionLogs(
  subscriptionId: string,
  options?: {
    changeType?: subscription_change_type
    limit?: number
    orderBy?: 'asc' | 'desc'
  }
) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    const subscription = await prisma.subscriptions.findFirst({
      where: isStaff
        ? { id: subscriptionId }
        : { id: subscriptionId, organization_id: organizationId },
      select: { id: true }
    })

    if (!subscription) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access',
        data: []
      }
    }

    const where: {
      subscription_id: string
      change_type?: subscription_change_type
    } = { subscription_id: subscriptionId }

    if (options?.changeType) {
      where.change_type = options.changeType
    }

    const subscriptionLogs = await prisma.subscription_logs.findMany({
      where,
      orderBy: { created_at: options?.orderBy ?? 'desc' },
      take: options?.limit,
    })

    return {
      success: true,
      data: subscriptionLogs,
      message: `Retrieved ${subscriptionLogs.length} subscription log(s)`
    }
  } catch (error) {
    logger.error('Error getting subscription logs', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error getting subscription logs',
      message: 'Error getting subscription logs',
      data: []
    }
  }
}

