/**
 * Payments Model for Prisma
 * 
 * Handles payment records from Stripe transactions.
 * 
 * Functionality:
 * - CRUD helpers for `payments` table
 * - Find payments by Stripe payment ID
 * - Create and update payment records
 * - Uses Prisma types for type safety
 */

import { prisma } from '../../../lib/prisma'
import type { payments } from '../../../app/generated/prisma'

type PaymentIdentifierColumn = 'stripe_payment_id' | 'paddle_payment_id'

let cachedPaymentIdentifierColumn: PaymentIdentifierColumn | null = null

async function resolvePaymentIdentifierColumn(): Promise<PaymentIdentifierColumn> {
  if (cachedPaymentIdentifierColumn) {
    return cachedPaymentIdentifierColumn
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name IN ('stripe_payment_id', 'paddle_payment_id')
  `

  const availableColumns = new Set(columns.map((column) => column.column_name))
  if (availableColumns.has('stripe_payment_id')) {
    cachedPaymentIdentifierColumn = 'stripe_payment_id'
    return cachedPaymentIdentifierColumn
  }

  if (availableColumns.has('paddle_payment_id')) {
    cachedPaymentIdentifierColumn = 'paddle_payment_id'
    return cachedPaymentIdentifierColumn
  }

  throw new Error('No supported payment identifier column found in payments table')
}

export const PaymentsModel = {
  /**
   * Find payment by Stripe payment ID
   */
  findPaymentByPaddleId: async (stripePaymentId: string): Promise<payments | null> => {
    return prisma.payments.findFirst({
      where: { stripe_payment_id: stripePaymentId }
    })
  },

  /**
   * Find payments by organization ID
   */
  findPaymentsByOrganizationId: async (organizationId: string): Promise<payments[]> => {
    return prisma.payments.findMany({
      where: { organization_id: organizationId },
      orderBy: { created_at: 'desc' }
    })
  },

  /**
   * Create new payment record
   */
  createPayment: async (data: {
    organization_id: string
    stripe_payment_id: string
    amount: number | string
    currency: string
    status: string
  }): Promise<payments> => {
    return prisma.payments.create({
      data: {
        organization_id: data.organization_id,
        stripe_payment_id: data.stripe_payment_id,
        amount: data.amount,
        currency: data.currency,
        status: data.status
      }
    })
  },

  /**
   * Update payment record
   */
  updatePayment: async (id: string, data: Partial<payments>): Promise<payments> => {
    return prisma.payments.update({
      where: { id },
      data: {
        ...data,
        // Note: payments table doesn't have updated_at field
      }
    })
  },

  /**
   * Upsert payment - create or update based on Stripe payment ID
   */
  upsertPayment: async (organizationId: string, paymentData: {
    stripe_payment_id: string
    amount: number | string
    currency: string
    status: string
  }): Promise<payments> => {
    // First try to find existing payment
    const existing = await prisma.payments.findFirst({
      where: { stripe_payment_id: paymentData.stripe_payment_id }
    })

    if (existing) {
      // Update existing payment
      return prisma.payments.update({
        where: { id: existing.id },
        data: {
          organization_id: organizationId,
          amount: paymentData.amount,
          currency: paymentData.currency,
          status: paymentData.status
        }
      })
    } else {
      // Create new payment
      return prisma.payments.create({
        data: {
          organization_id: organizationId,
          stripe_payment_id: paymentData.stripe_payment_id,
          amount: paymentData.amount,
          currency: paymentData.currency,
          status: paymentData.status
        }
      })
    }
  },

  /**
   * Upsert payment for Stripe webhook using the real payment ID column available in DB.
   */
  upsertPaymentFromStripeWebhook: async (organizationId: string, paymentData: {
    stripe_payment_id: string
    amount: number | string
    currency: string
    status: string
  }): Promise<void> => {
    const paymentIdentifierColumn = await resolvePaymentIdentifierColumn()
    const existingPayment = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM payments WHERE ${paymentIdentifierColumn} = $1 LIMIT 1`,
      paymentData.stripe_payment_id
    )

    if (existingPayment[0]?.id) {
      await prisma.$executeRawUnsafe(
        `UPDATE payments
         SET organization_id = $1, amount = $2::decimal, currency = $3, status = $4
         WHERE id = $5`,
        organizationId,
        paymentData.amount,
        paymentData.currency,
        paymentData.status,
        existingPayment[0].id
      )
      return
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO payments (organization_id, ${paymentIdentifierColumn}, amount, currency, status)
       VALUES ($1, $2, $3::decimal, $4, $5)`,
      organizationId,
      paymentData.stripe_payment_id,
      paymentData.amount,
      paymentData.currency,
      paymentData.status
    )
  },

  /**
   * Find paginated payments by organization ID
   */
  findPaginatedPayments: async (
    organizationId: string,
    sortBy: string = 'created_at',
    sortOrder: 'asc' | 'desc' = 'desc',
    offset: number = 0,
    limit: number = 20
  ): Promise<{ payments: payments[], total: number }> => {
    const [payments, total] = await Promise.all([
      prisma.payments.findMany({
        where: { organization_id: organizationId },
        orderBy: { [sortBy]: sortOrder },
        skip: offset,
        take: limit
      }),
      prisma.payments.count({
        where: { organization_id: organizationId }
      })
    ])

    return { payments, total }
  }
}

