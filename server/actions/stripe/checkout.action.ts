/**
 * @fileoverview Stripe checkout server actions.
 *
 * @remarks
 * Provides server actions to initiate Stripe subscription checkout flows, create embedded
 * and payment-element sessions, and update subscription payment methods. Authentication
 * uses the shared server-action-auth helpers.
 *
 * Key exports:
 * - `initiateSubscriptionCheckout`
 * - `createStripeCheckoutSession`
 * - `createEmbeddedCheckoutSession`
 * - `createPaymentElementSubscriptionSession`
 * - `updateSubscriptionWithPaymentMethod`
 *
 * Relevant types:
 * - `InitiateSubscriptionCheckoutResponse`
 * - `StripeCheckoutSessionResponse`
 * - `EmbeddedCheckoutSessionResponse`
 * - `PaymentElementSessionResponse`
 * - `UpdateSubscriptionResponse`
 */
'use server'

import Stripe from 'stripe'
import { z } from 'zod'
import { getAuthenticatedOrganizationAccess, requireServerActionUser } from '@/lib/server-action-auth'
import { OrganizationsModel } from '@/server/models/supabase/organizations.model'

const stripeApiVersion = '2026-01-28.clover' as const
const TRIAL_PERIOD_DAYS = 15

const sessionInputSchema = z.object({
  locale: z.string().min(2).max(10)
})

const stripeCheckoutInputSchema = z.object({
  locale: z.string().min(2).max(10),
  quantity: z.number().int().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  priceId: z.string().optional()
})

const initiateCheckoutInputSchema = z.object({
  plan: z.enum(['basic', 'pro']),
  locale: z.string().min(2).max(10)
})

export type InitiateSubscriptionCheckoutResponse =
  | {
      success: true
      planName: string
      organizationId: string
      userId: string
    }
  | { success: false; error: string }

export type EmbeddedCheckoutSessionResponse =
  | { success: true; clientSecret: string; publishableKey: string }
  | { success: false; error: string }

export type StripeCheckoutSessionResponse =
  | { success: true; url: string; sessionId: string }
  | { success: false; error: string }

export type PaymentElementSessionResponse =
  | {
      success: true
      clientSecret: string
      publishableKey: string
      subscriptionId: string
    }
  | { success: false; error: string }

export type UpdateSubscriptionResponse =
  | { success: true }
  | { success: false; error: string }

function buildStripeMetadata(input: {
  organizationId: string
  businessId?: string | null
  taxIdentifier?: string | null
}): Record<string, string> {
  const metadata: Record<string, string> = {
    organizationId: input.organizationId
  }

  if (input.businessId && input.businessId.trim().length > 0) {
    metadata.businessId = input.businessId.trim()
  }

  if (input.taxIdentifier && input.taxIdentifier.trim().length > 0) {
    metadata.taxIdentifier = input.taxIdentifier.trim()
  }

  return metadata
}

function normalizeCountryCode(value?: string | null): string | undefined {
  if (!value) return undefined
  const country = value.trim().toUpperCase()
  return country.length === 2 ? country : undefined
}

function buildCustomerBillingData(organization: {
  business_name?: string | null
  first_line_of_address?: string | null
  city?: string | null
  region?: string | null
  zip_code?: string | null
  country?: string | null
}) {
  const name = organization.business_name?.trim() || undefined
  const country = normalizeCountryCode(organization.country)
  const hasAddress =
    !!organization.first_line_of_address?.trim() ||
    !!organization.city?.trim() ||
    !!organization.region?.trim() ||
    !!organization.zip_code?.trim() ||
    !!country

  const address: Stripe.AddressParam | undefined = hasAddress
    ? {
        line1: organization.first_line_of_address?.trim() || undefined,
        city: organization.city?.trim() || undefined,
        state: organization.region?.trim() || undefined,
        postal_code: organization.zip_code?.trim() || undefined,
        country
      }
    : undefined

  return { name, address }
}

/**
 * Creates a Stripe hosted checkout session for subscriptions.
 *
 * @param input - Checkout parameters including locale, quantity, and redirect URLs
 * @returns Checkout session URL or error response
 */
export async function createStripeCheckoutSession(
  input: z.infer<typeof stripeCheckoutInputSchema>
): Promise<StripeCheckoutSessionResponse> {
  const parsed = stripeCheckoutInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid checkout parameters' }
  }

  try {
    await requireServerActionUser()
    const { organizationId } = await getAuthenticatedOrganizationAccess()
    const organization = await OrganizationsModel.findOrganizationById(organizationId)

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY
    const defaultPriceId =
      process.env.STRIPE_DEFAULT_PRICE_ID ?? 'price_1SZbz9IwjkbV6VvtEPpJ6fk7'

    if (!stripeSecretKey) {
      return { success: false, error: 'Stripe keys are not configured' }
    }

    const customerEmail = organization?.email?.trim() || undefined

    const stripeClient = new Stripe(stripeSecretKey, {
      apiVersion: stripeApiVersion
    })
    const billingData = buildCustomerBillingData(organization ?? {})
    const stripeMetadata = buildStripeMetadata({
      organizationId,
      businessId: organization?.business_id,
      taxIdentifier: organization?.tax_identifier
    })

    const customer = await stripeClient.customers.create({
      email: customerEmail ?? undefined,
      name: billingData.name,
      address: billingData.address,
      metadata: stripeMetadata
    })

    const checkoutSession = await stripeClient.checkout.sessions.create({
      mode: 'subscription',
      success_url: parsed.data.successUrl,
      cancel_url: parsed.data.cancelUrl,
      customer: customer.id,
      billing_address_collection: 'required',
      tax_id_collection: {
        enabled: true
      },
      customer_update: {
        address: 'auto',
        name: 'auto'
      },
      line_items: [
        {
          price: parsed.data.priceId ?? defaultPriceId,
          quantity: parsed.data.quantity
        }
      ],
      subscription_data: {
        trial_period_days: TRIAL_PERIOD_DAYS,
        metadata: stripeMetadata
      },
      metadata: stripeMetadata,
      locale:
        (parsed.data.locale as Stripe.Checkout.SessionCreateParams.Locale) ??
        'auto'
    })

    if (!checkoutSession.url) {
      return { success: false, error: 'Checkout session missing URL' }
    }

    return {
      success: true,
      url: checkoutSession.url,
      sessionId: checkoutSession.id
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create checkout session'
    return { success: false, error: message }
  }
}

/**
 * Initiates subscription checkout for an organization.
 *
 * @param input - Checkout parameters including plan selection and locale
 * @returns Checkout initiation data or error response
 */
export async function initiateSubscriptionCheckout(
  input: z.infer<typeof initiateCheckoutInputSchema>
): Promise<InitiateSubscriptionCheckoutResponse> {
  const parsed = initiateCheckoutInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid checkout parameters' }
  }

  try {
    const { clerkUserId } = await requireServerActionUser()
    const { organizationId } = await getAuthenticatedOrganizationAccess()

    return {
      success: true,
      planName: parsed.data.plan,
      organizationId,
      userId: clerkUserId
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to initiate checkout'
    return { success: false, error: message }
  }
}

/**
 * Creates a Stripe embedded checkout session.
 *
 * @param input - Checkout parameters including locale
 * @returns Embedded checkout session client secret and publishable key
 */
export async function createEmbeddedCheckoutSession(
  input: z.infer<typeof sessionInputSchema>
): Promise<EmbeddedCheckoutSessionResponse> {
  const parsed = sessionInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid checkout parameters' }
  }

  try {
    await requireServerActionUser()
    const { organizationId } = await getAuthenticatedOrganizationAccess()
    const organization = await OrganizationsModel.findOrganizationById(organizationId)

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY
    const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    const defaultPriceId =
      process.env.STRIPE_DEFAULT_PRICE_ID ?? 'price_1SZbz9IwjkbV6VvtEPpJ6fk7'

    if (!stripeSecretKey || !stripePublishableKey) {
      return { success: false, error: 'Stripe keys are not configured' }
    }

    const customerEmail = organization?.email?.trim() || undefined

    const stripeClient = new Stripe(stripeSecretKey, {
      apiVersion: stripeApiVersion
    })
    const billingData = buildCustomerBillingData(organization ?? {})
    const stripeMetadata = buildStripeMetadata({
      organizationId,
      businessId: organization?.business_id,
      taxIdentifier: organization?.tax_identifier
    })

    const customer = await stripeClient.customers.create({
      email: customerEmail ?? undefined,
      name: billingData.name,
      address: billingData.address,
      metadata: stripeMetadata
    })

    const checkoutSession = await stripeClient.checkout.sessions.create({
      mode: 'subscription',
      ui_mode: 'embedded',
      redirect_on_completion: 'never',
      automatic_tax: {
        enabled: true
      },
      billing_address_collection: 'required',
      tax_id_collection: {
        enabled: true
      },
      customer: customer.id,
      customer_update: {
        address: 'auto',
        name: 'auto'
      },
      line_items: [
        {
          price: defaultPriceId,
          quantity: 1
        }
      ],
      subscription_data: {
        trial_period_days: TRIAL_PERIOD_DAYS,
        metadata: stripeMetadata
      },
      metadata: stripeMetadata,
      locale:
        (parsed.data.locale as Stripe.Checkout.SessionCreateParams.Locale) ??
        'auto'
    })

    if (!checkoutSession.client_secret) {
      return { success: false, error: 'Checkout session missing client secret' }
    }

    return {
      success: true,
      clientSecret: checkoutSession.client_secret,
      publishableKey: stripePublishableKey
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create checkout session'
    return { success: false, error: message }
  }
}

/**
 * Creates a Stripe subscription session for Payment Element.
 *
 * @param input - Checkout parameters including locale
 * @returns Client secret, publishable key, and subscription id
 */
export async function createPaymentElementSubscriptionSession(
  input: z.infer<typeof sessionInputSchema>
): Promise<PaymentElementSessionResponse> {
  const parsed = sessionInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid checkout parameters' }
  }

  try {
    await requireServerActionUser()
    const { organizationId } = await getAuthenticatedOrganizationAccess()
    const organization = await OrganizationsModel.findOrganizationById(organizationId)

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY
    const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    const defaultPriceId =
      process.env.STRIPE_DEFAULT_PRICE_ID ?? 'price_1SZbz9IwjkbV6VvtEPpJ6fk7'

    if (!stripeSecretKey || !stripePublishableKey) {
      return { success: false, error: 'Stripe keys are not configured' }
    }

    const customerEmail = organization?.email?.trim() || undefined

    const stripeClient = new Stripe(stripeSecretKey, {
      apiVersion: stripeApiVersion
    })
    const billingData = buildCustomerBillingData(organization ?? {})
    const stripeMetadata = buildStripeMetadata({
      organizationId,
      businessId: organization?.business_id,
      taxIdentifier: organization?.tax_identifier
    })

    const customer = await stripeClient.customers.create({
      email: customerEmail ?? undefined,
      name: billingData.name,
      address: billingData.address,
      metadata: stripeMetadata
    })

    const subscription = await stripeClient.subscriptions.create({
      customer: customer.id,
      items: [
        {
          price: defaultPriceId,
          quantity: 1
        }
      ],
      trial_period_days: TRIAL_PERIOD_DAYS,
      payment_behavior: 'default_incomplete',
      collection_method: 'charge_automatically',
      payment_settings: {
        payment_method_types: ['card', 'link'],
        save_default_payment_method: 'on_subscription'
      },
      metadata: stripeMetadata,
      expand: ['latest_invoice.payment_intent', 'pending_setup_intent']
    })

    const latestInvoiceId =
      typeof subscription.latest_invoice === 'string'
        ? subscription.latest_invoice
        : subscription.latest_invoice?.id

    let paymentIntent: Stripe.PaymentIntent | null = null

    if (subscription.latest_invoice && typeof subscription.latest_invoice !== 'string') {
      const invoiceWithIntent = subscription.latest_invoice as Stripe.Invoice & {
        payment_intent?: string | Stripe.PaymentIntent | null
      }
      if (
        invoiceWithIntent.payment_intent &&
        typeof invoiceWithIntent.payment_intent !== 'string'
      ) {
        paymentIntent = invoiceWithIntent.payment_intent
      } else if (
        invoiceWithIntent.payment_intent &&
        typeof invoiceWithIntent.payment_intent === 'string'
      ) {
        paymentIntent = await stripeClient.paymentIntents.retrieve(
          invoiceWithIntent.payment_intent
        )
      }
    }

    if (!paymentIntent?.client_secret && latestInvoiceId) {
      const invoice = await stripeClient.invoices.retrieve(latestInvoiceId, {
        expand: ['payment_intent']
      })
      const invoiceWithIntent = invoice as Stripe.Invoice & {
        payment_intent?: string | Stripe.PaymentIntent | null
      }
      if (
        invoiceWithIntent.payment_intent &&
        typeof invoiceWithIntent.payment_intent !== 'string'
      ) {
        paymentIntent = invoiceWithIntent.payment_intent
      } else if (
        invoiceWithIntent.payment_intent &&
        typeof invoiceWithIntent.payment_intent === 'string'
      ) {
        paymentIntent = await stripeClient.paymentIntents.retrieve(
          invoiceWithIntent.payment_intent
        )
      }
    }

    if (!paymentIntent?.client_secret && subscription.pending_setup_intent) {
      if (typeof subscription.pending_setup_intent === 'string') {
        const setupIntent = await stripeClient.setupIntents.retrieve(
          subscription.pending_setup_intent
        )
        if (setupIntent.client_secret) {
          return {
            success: true,
            clientSecret: setupIntent.client_secret,
            publishableKey: stripePublishableKey,
            subscriptionId: subscription.id
          }
        }
      } else if (subscription.pending_setup_intent.client_secret) {
        return {
          success: true,
          clientSecret: subscription.pending_setup_intent.client_secret,
          publishableKey: stripePublishableKey,
          subscriptionId: subscription.id
        }
      }
    }

    if (!paymentIntent?.client_secret) {
      const setupIntent = await stripeClient.setupIntents.create({
        customer: customer.id,
        usage: 'off_session',
        metadata: {
          ...stripeMetadata,
          subscriptionId: subscription.id
        }
      })

      if (!setupIntent.client_secret) {
        return { success: false, error: 'Unable to start payment flow' }
      }

      return {
        success: true,
        clientSecret: setupIntent.client_secret,
        publishableKey: stripePublishableKey,
        subscriptionId: subscription.id
      }
    }

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
      publishableKey: stripePublishableKey,
      subscriptionId: subscription.id
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create payment intent'
    return { success: false, error: message }
  }
}

/**
 * Updates a Stripe subscription with a new payment method.
 *
 * @param subscriptionId - Stripe subscription id
 * @param paymentMethodId - Stripe payment method id
 * @returns Update result
 */
export async function updateSubscriptionWithPaymentMethod(
  subscriptionId: string,
  paymentMethodId: string
): Promise<UpdateSubscriptionResponse> {
  try {
    await requireServerActionUser()

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY

    if (!stripeSecretKey) {
      return { success: false, error: 'Stripe keys are not configured' }
    }

    const stripeClient = new Stripe(stripeSecretKey, {
      apiVersion: stripeApiVersion
    })

    await stripeClient.subscriptions.update(subscriptionId, {
      default_payment_method: paymentMethodId
    })

    const subscription = await stripeClient.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice.payment_intent']
    })

    const latestInvoiceId =
      typeof subscription.latest_invoice === 'string'
        ? subscription.latest_invoice
        : subscription.latest_invoice?.id

    if (latestInvoiceId) {
      let invoice =
        typeof subscription.latest_invoice === 'string'
          ? await stripeClient.invoices.retrieve(latestInvoiceId, {
              expand: ['payment_intent']
            })
          : (subscription.latest_invoice as Stripe.Invoice)

      if (invoice.status === 'draft') {
        invoice = await stripeClient.invoices.finalizeInvoice(latestInvoiceId, {
          expand: ['payment_intent']
        })
      }

      const amountDue = invoice.amount_due ?? 0

      if (amountDue === 0) {
        return { success: true }
      }

      if (invoice.status === 'open') {
        const paidInvoice = await stripeClient.invoices.pay(latestInvoiceId, {
          payment_method: paymentMethodId,
          expand: ['payment_intent']
        })

        const paidInvoiceWithIntent = paidInvoice as Stripe.Invoice & {
          payment_intent?: string | Stripe.PaymentIntent | null
        }

        const paidPaymentIntent =
          paidInvoiceWithIntent.payment_intent &&
          typeof paidInvoiceWithIntent.payment_intent !== 'string'
            ? paidInvoiceWithIntent.payment_intent
            : null

        if (paidPaymentIntent) {
          if (paidPaymentIntent.status !== 'succeeded') {
            return {
              success: false,
              error: `Invoice payment not completed (status: ${paidPaymentIntent.status ?? 'unknown'})`
            }
          }
          return { success: true }
        }

        if (paidInvoice.status === 'paid') {
          return { success: true }
        }

        return {
          success: false,
          error: 'Invoice payment missing payment intent'
        }
      }

      return {
        success: false,
        error: `Invoice not payable (status: ${invoice.status ?? 'unknown'})`
      }
    }

    return { success: true }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update subscription'
    return { success: false, error: message }
  }
}
