/**
 * Payments Server Actions
 * 
 * Handles payment operations for Stripe transactions.
 *
 * Functionality:
 * - Create payment records from Stripe transactions
 * - Update payment status
 * - Find payments by organization or Stripe payment ID
 */

'use server'

import { PaymentsModel } from '../../models/supabase/payments.model'
import { createLogger } from '@/lib/logger'
import type { payments } from '../../../app/generated/prisma'
import { getAuthenticatedOrganizationAccess, requireServerActionUser } from '@/lib/server-action-auth'
import { checkIfStaff } from '@/lib/auth-helpers'

const logger = createLogger('PAYMENTS')

async function getOrganizationAccessForAdmin() {
  const { clerkUserId } = await requireServerActionUser()
  const isStaff = await checkIfStaff(clerkUserId)

  if (isStaff) {
    return { isStaff }
  }

  const { organizationId } = await getAuthenticatedOrganizationAccess()
  return { isStaff, organizationId }
}

/**
 * Create payment record
 */
export async function createPayment(paymentData: {
  organization_id: string
  stripe_payment_id: string
  amount: number | string
  currency: string
  status: string
}) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff && paymentData.organization_id !== organizationId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Creating payment', {
      organizationId: paymentData.organization_id,
      stripePaymentId: paymentData.stripe_payment_id
    })

    const payment = await PaymentsModel.createPayment(paymentData)

    logger.info('Payment created successfully', {
      paymentId: payment.id,
      organizationId: payment.organization_id,
      stripePaymentId: payment.stripe_payment_id
    })

    return {
      success: true,
      data: payment,
      message: 'Payment created successfully'
    }
  } catch (error) {
    logger.error('Error creating payment', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error creating payment',
      message: 'Failed to create payment'
    }
  }
}

/**
 * Upsert payment record
 */
export async function upsertPayment(organizationId: string, paymentData: {
  stripe_payment_id: string
  amount: number | string
  currency: string
  status: string
}) {
  try {
    const { isStaff, organizationId: authenticatedOrganizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff && organizationId !== authenticatedOrganizationId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Upserting payment', {
      organizationId,
      stripePaymentId: paymentData.stripe_payment_id
    })

    const payment = await PaymentsModel.upsertPayment(organizationId, paymentData)

    logger.info('Payment upserted successfully', {
      paymentId: payment.id,
      organizationId: payment.organization_id,
      stripePaymentId: payment.stripe_payment_id
    })

    return {
      success: true,
      data: payment,
      message: 'Payment upserted successfully'
    }
  } catch (error) {
    logger.error('Error upserting payment', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error upserting payment',
      message: 'Failed to upsert payment'
    }
  }
}

/**
 * Find payment by Stripe payment ID
 */
export async function findPaymentByPaddleId(stripePaymentId: string) {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()

    logger.debug('Finding payment by Stripe ID', { stripePaymentId })

    const payment = await PaymentsModel.findPaymentByPaddleId(stripePaymentId)

    if (!payment) {
      return {
        success: false,
        error: 'Payment not found',
        message: 'No payment found with this Stripe payment ID'
      }
    }

    if (!isStaff && payment.organization_id !== organizationId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    return {
      success: true,
      data: payment,
      message: 'Payment retrieved successfully'
    }
  } catch (error) {
    logger.error('Error finding payment by Stripe ID', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error finding payment',
      message: 'Failed to find payment'
    }
  }
}

/**
 * Find payments by organization ID
 */
export async function findPaymentsByOrganizationId(organizationId: string) {
  try {
    const { isStaff, organizationId: authenticatedOrganizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff && organizationId !== authenticatedOrganizationId) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Unauthorized organization access'
      }
    }

    logger.debug('Finding payments by organization ID', { organizationId })

    const payments = await PaymentsModel.findPaymentsByOrganizationId(organizationId)

    return {
      success: true,
      data: payments,
      message: 'Payments retrieved successfully'
    }
  } catch (error) {
    logger.error('Error finding payments by organization ID', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error finding payments',
      message: 'Failed to find payments'
    }
  }
}

export interface PaymentsQueryParams {
  page: number
  limit: number
  organizationId: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedPaymentsResponse {
  payments: payments[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

/**
 * Get paginated payments by organization ID
 */
export async function getPaginatedPayments(params: PaymentsQueryParams): Promise<PaginatedPaymentsResponse> {
  try {
    const { isStaff, organizationId } = await getOrganizationAccessForAdmin()
    if (!isStaff && params.organizationId !== organizationId) {
      return {
        payments: [],
        pagination: {
          page: params.page,
          limit: params.limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        }
      }
    }

    logger.debug('Getting paginated payments', {
      page: params.page,
      limit: params.limit,
      organizationId: params.organizationId,
    })

    const offset = (params.page - 1) * params.limit
    const sortBy = params.sortBy || 'created_at'
    const sortOrder = params.sortOrder || 'desc'

    const result = await PaymentsModel.findPaginatedPayments(
      params.organizationId,
      sortBy,
      sortOrder,
      offset,
      params.limit
    )

    return {
      payments: result.payments,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / params.limit),
        hasNext: params.page < Math.ceil(result.total / params.limit),
        hasPrev: params.page > 1
      }
    }
  } catch (error) {
    logger.error('Error getting paginated payments', error)
    return {
      payments: [],
      pagination: {
        page: params.page,
        limit: params.limit,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      }
    }
  }
}

