/**
 * @fileoverview Stripe webhook endpoint for subscription and payment persistence.
 *
 * @remarks
 * Verifies the Stripe webhook signature and persists:
 * - Subscription state (`subscriptions`) based on Stripe subscription lifecycle events.
 * - Payment state (`payments`) based on Stripe invoice events.
 *
 * Key behavior:
 * - Idempotent upserts: subscriptions are upserted by `organization_id`, payments by `stripe_payment_id`.
 * - Organization resolution uses Stripe metadata set during checkout (`organizationId`).
 */

import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logger'
import { SubscriptionsModel } from '@/server/models/supabase/subscriptions.model'
import { PaymentsModel } from '@/server/models/supabase/payments.model'
import { OrganizationsModel } from '@/server/models/supabase/organizations.model'
import { prisma } from '@/lib/prisma'
import { subscribeAccountToGooglePubSub } from '@/server/actions/gmb/accounts.action'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const logger = createLogger('STRIPE-WEBHOOK')
const stripeApiVersion = '2026-01-28.clover' as const

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }
  return value
}

function unixSecondsToDate(value: number | null | undefined): Date | null {
  if (!value || typeof value !== 'number' || !Number.isFinite(value)) return null
  return new Date(value * 1000)
}

function amountCentsToDecimalString(amountCents: number | null | undefined): string {
  const cents = typeof amountCents === 'number' && Number.isFinite(amountCents) ? amountCents : 0
  return (cents / 100).toFixed(2)
}

function getOrganizationIdFromMetadata(
  metadata: Stripe.Metadata | null | undefined
): string | null {
  const organizationId = metadata?.organizationId
  return typeof organizationId === 'string' && organizationId.trim().length > 0
    ? organizationId
    : null
}

function getStripeCustomerId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (value && typeof value === 'object' && 'id' in value) {
    const customerId = (value as { id?: unknown }).id
    return typeof customerId === 'string' && customerId.trim().length > 0 ? customerId : null
  }
  return null
}

function getSubscriptionRecurringAmountAndCurrency(subscription: Stripe.Subscription): {
  amount: string | null
  currency: string | null
  planId: string | null
} {
  const firstItem = subscription.items.data[0]
  const quantity = firstItem?.quantity ?? 1
  const unitAmount = firstItem?.price?.unit_amount
  const currency = firstItem?.price?.currency
  const planId = firstItem?.price?.id ?? null

  if (typeof unitAmount !== 'number' || !Number.isFinite(unitAmount)) {
    return { amount: null, currency: currency?.toUpperCase() ?? null, planId }
  }

  const totalAmountCents = unitAmount * quantity
  return {
    amount: amountCentsToDecimalString(totalAmountCents),
    currency: currency?.toUpperCase() ?? null,
    planId
  }
}

async function resolveSubscriptionPeriodDates(
  stripeClient: Stripe,
  stripeSubscription: Stripe.Subscription
): Promise<{ periodStart: Date | null; periodEnd: Date | null }> {
  const firstItem = stripeSubscription.items?.data?.[0] as
    | { current_period_start?: unknown; current_period_end?: unknown }
    | undefined

  const itemPeriodStart = unixSecondsToDate(
    typeof firstItem?.current_period_start === 'number' ? firstItem.current_period_start : null
  )
  const itemPeriodEnd = unixSecondsToDate(
    typeof firstItem?.current_period_end === 'number' ? firstItem.current_period_end : null
  )

  if (itemPeriodStart || itemPeriodEnd) {
    return { periodStart: itemPeriodStart, periodEnd: itemPeriodEnd }
  }

  const latestInvoiceId =
    typeof stripeSubscription.latest_invoice === 'string' ? stripeSubscription.latest_invoice : null
  if (!latestInvoiceId) {
    return { periodStart: null, periodEnd: null }
  }

  try {
    const invoice = await stripeClient.invoices.retrieve(latestInvoiceId)
    const firstLine = invoice.lines?.data?.[0] as
      | { period?: { start?: unknown; end?: unknown } }
      | undefined

    const invoicePeriodStart = unixSecondsToDate(
      typeof firstLine?.period?.start === 'number' ? firstLine.period.start : null
    )
    const invoicePeriodEnd = unixSecondsToDate(
      typeof firstLine?.period?.end === 'number' ? firstLine.period.end : null
    )

    return { periodStart: invoicePeriodStart, periodEnd: invoicePeriodEnd }
  } catch (error) {
    logger.warn('Failed to resolve period from latest invoice', {
      subscriptionId: stripeSubscription.id,
      latestInvoiceId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return { periodStart: null, periodEnd: null }
  }
}

async function persistOrganizationStripeCustomerId(
  organizationId: string,
  stripeCustomerId: string | null
): Promise<void> {
  if (!stripeCustomerId) return

  try {
    await OrganizationsModel.upsertOrganizationStripeCustomerId(organizationId, stripeCustomerId)
  } catch (error) {
    logger.warn('Failed to persist Stripe customer id for organization', {
      organizationId,
      stripeCustomerId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

async function countActiveLocationsForOrganization(organizationId: string): Promise<number> {
  return prisma.locations.count({
    where: {
      status: 'active',
      connections: {
        organization_id: organizationId
      }
    }
  })
}

async function markOrganizationUsersOnboardingDone(organizationId: string): Promise<void> {
  try {
    await prisma.users.updateMany({
      where: {
        organization_id: organizationId,
        onboarding_status: {
          not: 'done'
        }
      },
      data: {
        onboarding_status: 'done'
      }
    })
  } catch (error) {
    logger.warn('Failed to mark organization users onboarding as done', {
      organizationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

async function ensureOrganizationConnectionsPubSub(organizationId: string): Promise<void> {
  try {
    const organizationUsers = await prisma.users.findMany({
      where: {
        organization_id: organizationId
      },
      select: {
        id: true
      }
    })

    if (organizationUsers.length === 0) {
      logger.warn('No organization users found to enable connection pub/sub', { organizationId })
      return
    }

    const results = await Promise.allSettled(
      organizationUsers.map((organizationUser) =>
        subscribeAccountToGooglePubSub(organizationUser.id)
      )
    )

    const failed = results.filter((result) => result.status === 'rejected').length
    if (failed > 0) {
      logger.warn('Some users failed while enabling connection pub/sub', {
        organizationId,
        usersTotal: organizationUsers.length,
        failed
      })
    }
  } catch (error) {
    logger.warn('Failed to ensure connection pub/sub for organization', {
      organizationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

async function resolveOrganizationIdForInvoice(
  stripeClient: Stripe,
  invoice: Stripe.Invoice
): Promise<string | null> {
  const direct = getOrganizationIdFromMetadata(invoice.metadata)
  if (direct) return direct

  const subscriptionId = (() => {
    const raw = (invoice as unknown as { subscription?: unknown }).subscription
    return typeof raw === 'string' ? raw : null
  })()
  if (subscriptionId) {
    const subscription = await stripeClient.subscriptions.retrieve(subscriptionId)
    return getOrganizationIdFromMetadata(subscription.metadata)
  }

  const customerId = typeof invoice.customer === 'string' ? invoice.customer : null
  if (customerId) {
    const customer = await stripeClient.customers.retrieve(customerId)
    if (customer && !('deleted' in customer) && customer.metadata) {
      return getOrganizationIdFromMetadata(customer.metadata)
    }
  }

  return null
}

async function resolveOrganizationIdForSubscription(
  stripeClient: Stripe,
  subscription: Stripe.Subscription
): Promise<string | null> {
  const direct = getOrganizationIdFromMetadata(subscription.metadata)
  if (direct) return direct

  const subscriptionIdLookup = await prisma.subscriptions.findFirst({
    where: { stripe_subscription_id: subscription.id },
    select: { organization_id: true }
  })
  if (subscriptionIdLookup?.organization_id) {
    return subscriptionIdLookup.organization_id
  }

  const customerId = typeof subscription.customer === 'string' ? subscription.customer : null
  if (!customerId) return null

  const organizationByCustomer = await prisma.organizations.findFirst({
    where: { stripe_customer_id: customerId },
    select: { id: true }
  })
  if (organizationByCustomer?.id) {
    return organizationByCustomer.id
  }

  const customer = await stripeClient.customers.retrieve(customerId)
  if (customer && !('deleted' in customer) && customer.metadata) {
    return getOrganizationIdFromMetadata(customer.metadata)
  }

  return null
}

async function resolveOrganizationIdFromCustomerId(
  stripeClient: Stripe,
  customerId: string
): Promise<string | null> {
  const organizationByCustomer = await prisma.organizations.findFirst({
    where: { stripe_customer_id: customerId },
    select: { id: true }
  })
  if (organizationByCustomer?.id) return organizationByCustomer.id

  const customer = await stripeClient.customers.retrieve(customerId)
  if (customer && !('deleted' in customer) && customer.metadata) {
    return getOrganizationIdFromMetadata(customer.metadata)
  }

  return null
}

function getPeriodFromSchedule(schedule: Stripe.SubscriptionSchedule): { periodStart: Date | null; periodEnd: Date | null } {
  const scheduleWithPhases = schedule as Stripe.SubscriptionSchedule & {
    current_phase?: { start_date?: number | null; end_date?: number | null } | null
    phases?: Array<{ start_date?: number | null; end_date?: number | null }>
  }

  const currentPhase = scheduleWithPhases.current_phase
  const fallbackPhase = scheduleWithPhases.phases?.[0]
  const startSeconds = currentPhase?.start_date ?? fallbackPhase?.start_date ?? null
  const endSeconds = currentPhase?.end_date ?? fallbackPhase?.end_date ?? null

  return {
    periodStart: unixSecondsToDate(startSeconds),
    periodEnd: unixSecondsToDate(endSeconds)
  }
}

async function upsertSubscriptionFromSchedule(
  stripeClient: Stripe,
  schedule: Stripe.SubscriptionSchedule
) {
  const customerId = typeof schedule.customer === 'string' ? schedule.customer : null
  if (!customerId) {
    logger.warn('Subscription schedule webhook missing customer id', { scheduleId: schedule.id })
    return
  }

  const organizationId = await resolveOrganizationIdFromCustomerId(stripeClient, customerId)
  if (!organizationId) {
    logger.warn('Subscription schedule webhook missing resolvable organization', {
      scheduleId: schedule.id,
      customerId
    })
    return
  }

  const existingSubscription = await SubscriptionsModel.findSubscriptionByOrganizationId(organizationId)
  if (!existingSubscription) {
    logger.warn('No local subscription to update from schedule payload', {
      scheduleId: schedule.id,
      organizationId
    })
    return
  }

  const { periodStart, periodEnd } = getPeriodFromSchedule(schedule)
  await SubscriptionsModel.updateSubscription(existingSubscription.id, {
    periodStart,
    periodEnd
  })
}

async function upsertSubscriptionFromStripeSubscription(
  stripeClient: Stripe,
  stripeSubscription: Stripe.Subscription
) {
  const organizationId = await resolveOrganizationIdForSubscription(stripeClient, stripeSubscription)
  if (!organizationId) {
    logger.warn('Subscription webhook missing organizationId metadata', {
      subscriptionId: stripeSubscription.id
    })
    return
  }

  const { periodStart, periodEnd } = await resolveSubscriptionPeriodDates(stripeClient, stripeSubscription)
  const activeAt = unixSecondsToDate(
    stripeSubscription.start_date ?? null
  )
  const trialStart = unixSecondsToDate(stripeSubscription.trial_start ?? null)
  const trialEnd = unixSecondsToDate(stripeSubscription.trial_end ?? null)
  const isPastDue = stripeSubscription.status === 'past_due'
  const { amount: nextPaymentAmount, currency, planId } =
    getSubscriptionRecurringAmountAndCurrency(stripeSubscription)
  const stripeCustomerId = getStripeCustomerId(stripeSubscription.customer)
  const activeLocationsCount = await countActiveLocationsForOrganization(organizationId)

  await persistOrganizationStripeCustomerId(organizationId, stripeCustomerId)

  await SubscriptionsModel.upsertSubscription(organizationId, {
    id: stripeSubscription.id,
    status: stripeSubscription.status,
    stripe_customer_id: stripeCustomerId,
    plan_id: planId,
    active_at: activeAt,
    past_due_at: isPastDue ? new Date() : null,
    trial_start: trialStart,
    trial_end: trialEnd,
    cancel_at_period_end: stripeSubscription.cancel_at_period_end,
    next_payment_amount: nextPaymentAmount,
    periodStart,
    currency,
    periodEnd,
    location_active_count: activeLocationsCount
  })

  if (stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing') {
    await markOrganizationUsersOnboardingDone(organizationId)
    await ensureOrganizationConnectionsPubSub(organizationId)
  }
}

async function upsertPaymentFromInvoice(
  stripeClient: Stripe,
  invoice: Stripe.Invoice,
  statusOverride?: string
) {
  const organizationId = await resolveOrganizationIdForInvoice(stripeClient, invoice)
  if (!organizationId) {
    logger.warn('Invoice webhook missing organizationId metadata', {
      invoiceId: invoice.id
    })
    return
  }

  const stripePaymentId = (() => {
    const rawPaymentIntent = (invoice as unknown as { payment_intent?: unknown }).payment_intent
    if (typeof rawPaymentIntent === 'string' && rawPaymentIntent) return rawPaymentIntent
    const rawCharge = (invoice as unknown as { charge?: unknown }).charge
    if (typeof rawCharge === 'string' && rawCharge) return rawCharge
    return invoice.id
  })()

  const amountCents =
    typeof invoice.amount_paid === 'number' ? invoice.amount_paid : invoice.amount_due
  const stripeCustomerId = getStripeCustomerId(invoice.customer)

  await persistOrganizationStripeCustomerId(organizationId, stripeCustomerId)

  await PaymentsModel.upsertPaymentFromStripeWebhook(organizationId, {
    stripe_payment_id: stripePaymentId,
    amount: amountCentsToDecimalString(amountCents),
    currency: String(invoice.currency ?? 'usd'),
    status: statusOverride ?? String(invoice.status ?? 'unknown')
  })
}

async function syncSubscriptionFromInvoice(
  stripeClient: Stripe,
  invoice: Stripe.Invoice
): Promise<void> {
  const rawSubscription = (invoice as unknown as { subscription?: unknown }).subscription
  const subscriptionId = typeof rawSubscription === 'string' ? rawSubscription : null
  if (!subscriptionId) return

  try {
    const stripeSubscription = await stripeClient.subscriptions.retrieve(subscriptionId)
    await upsertSubscriptionFromStripeSubscription(stripeClient, stripeSubscription)
  } catch (error) {
    logger.warn('Failed to sync subscription after payment event', {
      invoiceId: invoice.id,
      subscriptionId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

async function syncSubscriptionFromInvoicePayment(
  stripeClient: Stripe,
  invoicePayment: unknown
): Promise<void> {
  const invoiceId = (() => {
    const rawInvoice = (invoicePayment as { invoice?: unknown }).invoice
    if (typeof rawInvoice === 'string') return rawInvoice
    if (rawInvoice && typeof rawInvoice === 'object' && 'id' in rawInvoice) {
      const value = (rawInvoice as { id?: unknown }).id
      return typeof value === 'string' ? value : null
    }
    return null
  })()

  if (!invoiceId) return

  try {
    const invoice = await stripeClient.invoices.retrieve(invoiceId)
    await syncSubscriptionFromInvoice(stripeClient, invoice)
  } catch (error) {
    logger.warn('Failed to retrieve invoice from invoice_payment event', {
      invoiceId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export async function POST(request: NextRequest) {
  let clerkUserIdForLog: string | undefined
  try {
    const stripeSecretKey = getRequiredEnv('STRIPE_SECRET_KEY')
    const webhookSecret = getRequiredEnv('STRIPE_WEBHOOK_SECRET')

    const signature = request.headers.get('stripe-signature')
    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature', message: 'stripe-signature header is required' },
        { status: 400 }
      )
    }

    const payload = await request.text()

    const stripeClient = new Stripe(stripeSecretKey, {
      apiVersion: stripeApiVersion
    })

    const event = stripeClient.webhooks.constructEvent(payload, signature, webhookSecret)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orgId = getOrganizationIdFromMetadata(session.metadata)
        const stripeCustomerId = getStripeCustomerId(session.customer)
        clerkUserIdForLog = session.metadata?.userId

        if (orgId && session.mode === 'subscription' && typeof session.subscription === 'string') {
          await persistOrganizationStripeCustomerId(orgId, stripeCustomerId)
          const subscription = await stripeClient.subscriptions.retrieve(session.subscription)
          await upsertSubscriptionFromStripeSubscription(stripeClient, subscription)
        } else if (!orgId) {
          logger.warn('checkout.session.completed missing organizationId metadata', {
            sessionId: session.id
          })
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await upsertSubscriptionFromStripeSubscription(stripeClient, subscription)
        break
      }

      case 'subscription_schedule.created':
      case 'subscription_schedule.updated':
      case 'subscription_schedule.released': {
        const schedule = event.data.object as Stripe.SubscriptionSchedule
        await upsertSubscriptionFromSchedule(stripeClient, schedule)
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        await upsertPaymentFromInvoice(stripeClient, invoice, 'succeeded')
        await syncSubscriptionFromInvoice(stripeClient, invoice)
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        await upsertPaymentFromInvoice(stripeClient, invoice, 'paid')
        await syncSubscriptionFromInvoice(stripeClient, invoice)
        break
      }

      case 'invoice_payment.paid': {
        await syncSubscriptionFromInvoicePayment(stripeClient, event.data.object as unknown)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        await upsertPaymentFromInvoice(stripeClient, invoice, 'failed')
        break
      }

      default: {
        logger.debug('Unhandled Stripe webhook event type', { type: event.type })
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    logger.error('Stripe webhook handler failed', error, { clerkUserId: clerkUserIdForLog })
    return NextResponse.json(
      { error: 'Webhook error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

