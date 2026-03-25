import { prisma } from '../../../lib/prisma'
import type { organizations, subscriptions } from '../../../app/generated/prisma'
import type { OrganizationData } from '../clerk/organizationMemberships.model'
import { UsersModel } from './users.model'

type OrganizationStripeCustomerColumn = 'stripe_customer_id' | 'paddle_id'

let cachedOrganizationStripeCustomerColumn: OrganizationStripeCustomerColumn | null = null

async function resolveOrganizationStripeCustomerColumn(): Promise<OrganizationStripeCustomerColumn> {
  if (cachedOrganizationStripeCustomerColumn) {
    return cachedOrganizationStripeCustomerColumn
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name IN ('stripe_customer_id', 'paddle_id')
  `

  const availableColumns = new Set(columns.map((column) => column.column_name))
  if (availableColumns.has('stripe_customer_id')) {
    cachedOrganizationStripeCustomerColumn = 'stripe_customer_id'
    return cachedOrganizationStripeCustomerColumn
  }

  if (availableColumns.has('paddle_id')) {
    cachedOrganizationStripeCustomerColumn = 'paddle_id'
    return cachedOrganizationStripeCustomerColumn
  }

  throw new Error('No supported Stripe customer column found in organizations table')
}

/**
 * Overview: Organizations model for Prisma (Supabase)
 * - CRUD helpers for `organizations` table
 * - Lookups by creator and Clerk organization id
 */

export const OrganizationsModel = {
  findOrganizationByCreator: async (creatorId: string): Promise<organizations | null> => {
    return prisma.organizations.findFirst({
      where: { created_by: creatorId }
    })
  },

  findOrganizationById: async (id: string): Promise<organizations | null> => {
    return prisma.organizations.findUnique({
      where: { id }
    })
  },

  findOrganizationByIdWithRelations: async (id: string) => {
    return prisma.organizations.findUnique({
      where: { id },
      include: {
        users_users_organization_idToorganizations: {
          select: {
            id: true,
            email: true,
            name: true,
            lastname: true,
            role: true,
            created_at: true
          }
        },
        subscriptions: true
      }
    })
  },

  findOrganizationByClerkId: async (clerkId: string): Promise<organizations | null> => {
    return prisma.organizations.findUnique({
      where: { organization_clerk_id: clerkId }
    })
  },

  findExistingOrganization: async (userClerkId: string) => {
    return prisma.organizations.findFirst({
      where: {
        users_users_organization_idToorganizations: { some: { clerk_id: userClerkId } }
      }
    })
  },

  createOrganization: async (data: {
    business_name?: string;
    business_address?: string;
    business_id?: string;
    created_by?: string;
    email?: string;
    primary_phone?: string;
    organization_clerk_id?: string;
    first_line_of_address?: string;
    city?: string;
    region?: string;
    zip_code?: string;
    country?: string;
    tax_identifier?: string;
  }) => {
    return prisma.organizations.create({
      data: {
        ...data,
        // Ensure required fields have default values if not provided
        first_line_of_address: data.first_line_of_address || data.business_address?.split(',')[0]?.trim() || '',
        city: data.city || '',
        zip_code: data.zip_code || '',
        country: data.country || '',
      }
    })
  },

  updateOrganizationOnboarding: async (
    data: OrganizationData,
    userEmail: string,
    userName?: string,
    userLastName?: string,
    clerkOrgId?: string
  ) => {
    return prisma.$transaction(async (tx) => {
      // Find or create user in our database

      let dbUser = await UsersModel.findUserByClerkId(data.clerkUserId)

      if (!dbUser) {
        const { user } = await UsersModel.createUser({
          clerk_id: data.clerkUserId,
          email: userEmail,
          name: userName || null,
          lastname: userLastName || null,
          username: userEmail || `user_${Date.now()}`,
          role: 'CLIENT', // Set as CLIENT for business users
          wa_id: `wa_${Date.now()}`,
          onboarding_status: 'client' // Mark as in onboarding process
        })
        dbUser = user
      }

      // Build business_address concatenated for backward compatibility
      const business_address = `${data.address}, ${data.city}${data.state ? `, ${data.state}` : ''}, ${data.country} ${data.postalCode}`.trim()

      const orgId = dbUser.organization_id ?? undefined
      if (!orgId) {
        throw new Error('ORGANIZATION_ID_REQUIRED')
      }

      const currentOrg = await tx.organizations.findUnique({
        where: { id: orgId },
        select: { business_id: true }
      })

      const newBusinessId = (data.businessId && data.businessId.trim()) ? data.businessId.trim() : null
      if (newBusinessId) {
        const currentBusinessId = currentOrg?.business_id?.trim() || null
        if (currentBusinessId === newBusinessId) {
          // Same organization, same business_id - allow update (idempotent)
        } else {
          // Check if another organization has this business_id
          const existingWithSameBusinessId = await tx.organizations.findFirst({
            where: { business_id: newBusinessId, id: { not: orgId } },
            select: { id: true, business_id: true }
          })
          if (existingWithSameBusinessId) {
            throw new Error('BUSINESS_ID_TAKEN')
          }
        }
      } else if (!newBusinessId && data.businessId) {
        // businessId provided but empty/whitespace - this shouldn't happen if form validation works
        // but we'll allow it and set to null
      }

      const organization = await tx.organizations.update({
        where: { id: orgId },
        data: {
          business_name: data.businessName,
          business_id: newBusinessId,
          tax_identifier: data.taxId || null,
          email: data.email,
          primary_phone: data.phone || null,
          // Keep legacy business_address concatenated
          business_address: business_address,
          // New individual fields
          first_line_of_address: data.address || '',
          city: data.city || '',
          region: data.state || null,
          zip_code: data.postalCode || '',
          country: data.country || '',
          organization_clerk_id: clerkOrgId ?? undefined,
        }
      })

      // Update user to link to organization
      await tx.users.update({
        where: { id: dbUser.id },
        data: { 
          organization_id: organization.id,
          onboarding_status: 'onLocalizationPage' // Update onboarding status
        }
      })

      return organization
    })
  },

  updateOrganization: async (id: string, data: Partial<organizations>) => {
    return prisma.organizations.update({
      where: { id },
      data
    })
  },

  updateOrganizationWithClerkId: async (organizationId: string, clerkOrgId: string) => {
    return prisma.organizations.update({
      where: { id: organizationId },
      data: { organization_clerk_id: clerkOrgId }
    })
  },

  /**
   * Stores Stripe customer id in organizations table using the available DB column.
   */
  upsertOrganizationStripeCustomerId: async (
    organizationId: string,
    stripeCustomerId: string
  ): Promise<void> => {
    const stripeCustomerColumn = await resolveOrganizationStripeCustomerColumn()
    await prisma.$executeRawUnsafe(
      `UPDATE organizations
       SET ${stripeCustomerColumn} = $1
       WHERE id = $2`,
      stripeCustomerId,
      organizationId
    )
  },

  deleteOrganization: async (id: string) => {
    return prisma.organizations.delete({
      where: { id }
    })
  },

  findManyWithRelations: async (
    where: Record<string, unknown>,
    sortBy: string = 'created_at',
    sortOrder: 'asc' | 'desc' = 'desc',
    offset: number = 0,
    limit: number = 10,
    includeCount: boolean = false
  ) => {
    if (includeCount) {
      const [organizations, totalCount] = await Promise.all([
        prisma.organizations.findMany({
          where,
          include: {
            users_users_organization_idToorganizations: {
              select: { id: true, email: true, name: true, lastname: true, role: true, created_at: true }
            },
            connections: {
              select: { id: true, provider: true, external_account_id: true, created_at: true }
            },
            subscriptions: {
              select: {
                id: true,
                status: true,
                stripe_subscription_id: true,
                periodEnd: true,
                created_at: true,
                updated_at: true
              }
            }
          },
          orderBy: { [sortBy]: sortOrder },
          skip: offset,
          take: limit
        }),
        prisma.organizations.count({ where })
      ])
      return { organizations: organizations as organizations[], totalCount: totalCount as number }
    }
    return prisma.organizations.findMany({
      where,
      include: {
        users_users_organization_idToorganizations: {
          select: { id: true, email: true, name: true, lastname: true, role: true, created_at: true }
        },
        connections: {
          select: { id: true, provider: true, external_account_id: true, created_at: true }
        }
      },
      orderBy: { [sortBy]: sortOrder },
      skip: offset,
      take: limit
    })
  },

  /**
   * Find organizations with locations included for counting
   * Returns organizations with full relations including nested locations
   * Used for dashboard tables that need location statistics
   */
  findManyWithLocationsForCount: async (
    where: Record<string, unknown>,
    sortBy: string = 'created_at',
    sortOrder: 'asc' | 'desc' = 'desc',
    offset: number = 0,
    limit: number = 10
  ) => {
    // Execute all queries in parallel for better performance
    const [organizations, totalCount] = await Promise.all([
      prisma.organizations.findMany({
        where,
        include: {
          users_users_organization_idToorganizations: {
            select: {
              id: true,
              email: true,
              name: true,
              lastname: true,
              role: true,
              created_at: true,
            },
          },
          connections: {
            include: {
              locations: {
                select: { id: true, status: true },
              },
            },
          },
          subscriptions: {
            select: {
              id: true,
              status: true,
              stripe_subscription_id: true,
              periodEnd: true,
              created_at: true,
              updated_at: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: offset,
        take: limit,
      }),
      prisma.organizations.count({ where }),
    ])

    return { organizations, totalCount }
  },

  count: async (where: Record<string, unknown>) => {
    return prisma.organizations.count({ where })
  },

  buildWhereClause: (params: {
    search?: string;
    created_by?: string;
    subscription?: {
      status?: subscriptions['status']
      plan_id?: string
      stripe_customer_id?: string
      active_at?: string
      past_due_at?: string
      next_payment_amount?: string
      periodStart?: string
      currency?: string
    }
  }) => {
    const { search, created_by, subscription } = params
    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { business_name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { primary_phone: { contains: search, mode: 'insensitive' } },
        { organization_clerk_id: { contains: search, mode: 'insensitive' } },
        { business_address: { contains: search, mode: 'insensitive' } },
        { first_line_of_address: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { region: { contains: search, mode: 'insensitive' } },
        { zip_code: { contains: search, mode: 'insensitive' } },
        { country: { contains: search, mode: 'insensitive' } }
      ] as Record<string, unknown>[]
      if (subscription && where.OR instanceof Array) {
        where.OR.push({ subscriptions: { some: {
          status: subscription.status,
          plan_id: subscription.plan_id,
          stripe_customer_id: subscription.stripe_customer_id,
          active_at: subscription.active_at,
          past_due_at: subscription.past_due_at,
          next_payment_amount: subscription.next_payment_amount,
          periodStart: subscription.periodStart,
          currency: subscription.currency
        } } } as Record<string, unknown>)
      }
    }

    if (created_by) {
      where.created_by = created_by
    }
    
    if (subscription) {
      where.subscriptions = {
        status: subscription.status,
        plan_id: subscription.plan_id,
        stripe_customer_id: subscription.stripe_customer_id,
        active_at: subscription.active_at,
        past_due_at: subscription.past_due_at,
        next_payment_amount: subscription.next_payment_amount,
        periodStart: subscription.periodStart,
        currency: subscription.currency
      }
    }

    return where
  }
}


