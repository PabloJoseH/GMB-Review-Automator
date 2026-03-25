import { prisma } from '../../../lib/prisma'
import type { subscriptions, subscription_change_type } from '../../../app/generated/prisma'

/**
 * Overview: Subscriptions model for Prisma (Stripe-backed).
 * - CRUD helpers for `subscriptions` table
 * - Handles subscription upsert and cancellation operations
 * - Uses Prisma types for type safety
 */

/**
 * Subscription data structure for upsert operations (Stripe subscription ID)
 */
export type StripeSubscriptionData = {
  id: string
  status?: subscriptions['status']
  stripe_customer_id?: string | null
  plan_id?: string | null
  location_active_count?: number
  active_at?: Date | string | null
  past_due_at?: Date | string | null
  trial_start?: Date | string | null
  trial_end?: Date | string | null
  cancel_at_period_end?: boolean | null
  next_payment_amount?: number | string | null
  periodStart?: Date | string | null
  currency?: string | null
  periodEnd?: Date | string | null
}

export type PaddleSubscriptionData = StripeSubscriptionData

function normalizeDate(value?: Date | string | null): Date | null {
  if (!value) return null
  return typeof value === 'string' ? new Date(value) : value
}

function isSameDate(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

export const SubscriptionsModel = {
  /**
   * Find subscription by organization ID
   */
  findSubscriptionByOrganizationId: async (organizationId: string): Promise<subscriptions | null> => {
    return prisma.subscriptions.findUnique({
      where: { organization_id: organizationId }
    })
  },

  /**
   * Find subscription by Stripe subscription ID
   */
  findSubscriptionByPaddleId: async (stripeSubscriptionId: string): Promise<subscriptions | null> => {
    return prisma.subscriptions.findFirst({
      where: { stripe_subscription_id: stripeSubscriptionId }
    })
  },

  /**
   * Upsert subscription - create or update based on organization ID
   */
  upsertSubscription: async (organizationId: string, subscriptionData: StripeSubscriptionData): Promise<subscriptions> => {
    const periodEnd = normalizeDate(subscriptionData.periodEnd)
    const activeAt = normalizeDate(subscriptionData.active_at)
    const pastDueAt = normalizeDate(subscriptionData.past_due_at)
    const trialStart = normalizeDate(subscriptionData.trial_start)
    const trialEnd = normalizeDate(subscriptionData.trial_end)
    const periodStart = normalizeDate(subscriptionData.periodStart)
    const normalizedCurrency = subscriptionData.currency ? subscriptionData.currency.toUpperCase() : null

    return prisma.$transaction(async (tx) => {
      const previousSubscription = await tx.subscriptions.findUnique({
        where: { organization_id: organizationId }
      })

      const nextSubscription = await tx.subscriptions.upsert({
        where: { organization_id: organizationId },
        update: {
          status: subscriptionData.status ?? null,
          stripe_subscription_id: subscriptionData.id,
          stripe_customer_id: subscriptionData.stripe_customer_id ?? null,
          plan_id: subscriptionData.plan_id ?? null,
          location_active_count: subscriptionData.location_active_count ?? undefined,
          active_at: activeAt,
          past_due_at: pastDueAt,
          trial_start: trialStart,
          trial_end: trialEnd,
          cancel_at_period_end: subscriptionData.cancel_at_period_end ?? false,
          next_payment_amount: subscriptionData.next_payment_amount ?? null,
          periodStart,
          currency: normalizedCurrency,
          periodEnd,
          updated_at: new Date()
        },
        create: {
          organization_id: organizationId,
          status: subscriptionData.status ?? 'incomplete',
          stripe_subscription_id: subscriptionData.id,
          stripe_customer_id: subscriptionData.stripe_customer_id ?? null,
          plan_id: subscriptionData.plan_id ?? null,
          location_active_count: subscriptionData.location_active_count ?? 0,
          active_at: activeAt,
          past_due_at: pastDueAt,
          trial_start: trialStart,
          trial_end: trialEnd,
          cancel_at_period_end: subscriptionData.cancel_at_period_end ?? false,
          next_payment_amount: subscriptionData.next_payment_amount ?? null,
          periodStart,
          currency: normalizedCurrency,
          periodEnd,
        }
      })

      const statusChanged = (previousSubscription?.status ?? null) !== (nextSubscription.status ?? null)
      const periodChanged =
        !isSameDate(previousSubscription?.periodStart, nextSubscription.periodStart) ||
        !isSameDate(previousSubscription?.periodEnd, nextSubscription.periodEnd)

      if (!previousSubscription || statusChanged || periodChanged) {
        const changeType: subscription_change_type = statusChanged || !previousSubscription
          ? 'status_change'
          : 'scheduled_change'

        await tx.subscription_logs.create({
          data: {
            subscription_id: nextSubscription.id,
            change_type: changeType,
            new_status: nextSubscription.status ?? null,
            new_period_start: nextSubscription.periodStart ?? null,
            new_period_end: nextSubscription.periodEnd ?? null,
            scheduled_for: null
          }
        })
      }

      return nextSubscription
    })
  },

  /**
   * Cancel subscription by updating status to canceled
   */
  cancelSubscription: async (organizationId: string, subscriptionData: StripeSubscriptionData): Promise<subscriptions> => {
    const periodEnd = normalizeDate(subscriptionData.periodEnd)
    const periodStart = normalizeDate(subscriptionData.periodStart)

    return prisma.$transaction(async (tx) => {
      const updatedSubscription = await tx.subscriptions.update({
        where: { organization_id: organizationId },
        data: {
          status: subscriptionData.status ?? 'canceled',
          stripe_subscription_id: subscriptionData.id,
          stripe_customer_id: subscriptionData.stripe_customer_id ?? null,
          cancel_at_period_end: subscriptionData.cancel_at_period_end ?? true,
          periodStart,
          next_payment_amount: subscriptionData.next_payment_amount ?? null,
          currency: subscriptionData.currency ? subscriptionData.currency.toUpperCase() : null,
          periodEnd,
          updated_at: new Date()
        }
      })

      await tx.subscription_logs.create({
        data: {
          subscription_id: updatedSubscription.id,
          change_type: 'status_change',
          new_status: updatedSubscription.status ?? null,
          new_period_start: updatedSubscription.periodStart ?? null,
          new_period_end: updatedSubscription.periodEnd ?? null,
          scheduled_for: null
        }
      })

      return updatedSubscription
    })
  },

  /**
   * Create new subscription
   */
  createSubscription: async (data: {
    organization_id: string
    status: subscriptions['status']
    stripe_subscription_id: string
    periodEnd?: Date | null
    location_active_count?: number
  }): Promise<subscriptions> => {
    return prisma.subscriptions.create({
      data
    })
  },

  /**
   * Update subscription
   */
  updateSubscription: async (id: string, data: Partial<subscriptions>): Promise<subscriptions> => {
    return prisma.$transaction(async (tx) => {
      const previousSubscription = await tx.subscriptions.findUnique({ where: { id } })
      const updatedSubscription = await tx.subscriptions.update({
        where: { id },
        data: {
          ...data,
          updated_at: new Date()
        }
      })

      const statusChanged = (previousSubscription?.status ?? null) !== (updatedSubscription.status ?? null)
      const periodChanged =
        !isSameDate(previousSubscription?.periodStart, updatedSubscription.periodStart) ||
        !isSameDate(previousSubscription?.periodEnd, updatedSubscription.periodEnd)

      if (statusChanged || periodChanged) {
        const changeType: subscription_change_type = statusChanged ? 'status_change' : 'scheduled_change'
        await tx.subscription_logs.create({
          data: {
            subscription_id: updatedSubscription.id,
            change_type: changeType,
            new_status: updatedSubscription.status ?? null,
            new_period_start: updatedSubscription.periodStart ?? null,
            new_period_end: updatedSubscription.periodEnd ?? null,
            scheduled_for: null
          }
        })
      }

      return updatedSubscription
    })
  }
}
