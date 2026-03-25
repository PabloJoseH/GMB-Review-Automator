/**
 * Onboarding Helpers - Centralized Logic for Onboarding Flow
 * 
 * This module provides centralized functions for handling onboarding status
 * validation and redirections. It eliminates code duplication across
 * onboarding pages and ensures consistent behavior.
 * 
 * Key features:
 * - Centralized onboarding status validation
 * - Consistent redirection logic
 * - Type-safe onboarding status handling
 * - Reusable validation functions
 */

import { redirect } from 'next/navigation'
import { onboarding_status } from '@/app/generated/prisma'
import type { users } from '@/app/generated/prisma'
import { createLogger } from '@/lib/logger'

const logger = createLogger('ONBOARDING-HELPERS')


// check a map that return the onboarding status with the page, default to welcome 
const onboardingStatusMap: Record<onboarding_status, string> = {
  [onboarding_status.user]: 'welcome',
  [onboarding_status.done]: 'complete',
  [onboarding_status.onOrganizationPage]: 'step-1',
  [onboarding_status.onLocationPage]: 'step-2',
  [onboarding_status.onPaymentPage]: 'step-3',
  [onboarding_status.client]: 'no-redirect',
  [onboarding_status.onLocalizationPage]: 'welcome',
}


/**
 * Determines the correct redirect path based on onboarding status
 * 
 * @param onboardingStatus - Current onboarding status from database
 * @param hasOrganization - Whether user has an organization_id
 * @param locale - Current locale (e.g., 'en', 'es')
 * @param currentPage - Current page the user is on (e.g., 'welcome', 'step-1', 'step-2', 'step-3')
 * @returns Redirect path or null if user is on correct page
 */
export function getOnboardingRedirect(
  onboardingStatus: onboarding_status,
  hasOrganization: boolean,
  locale: string,
  currentPage?: string
): string | null {
  logger.debug('Determining onboarding redirect', {
    status: onboardingStatus,
    hasOrganization,
    locale,
    currentPage
  })

  const onboardingStatusPage = onboardingStatusMap[onboardingStatus]

  if (onboardingStatusPage === currentPage || onboardingStatusPage === 'no-redirect') {
    return null
  }

  if (onboardingStatusPage === 'welcome') {
    return `/${locale}/onboarding`
  }

  return `/${locale}/onboarding/${onboardingStatusPage}`
}

/**
 * Validates user onboarding status and redirects if necessary
 * 
 * @param dbUser - User object from database
 * @param expectedStatuses - Array of valid statuses for current page
 * @param locale - Current locale
 * @param currentPath - Current page path for logging
 */
export function validateAndRedirect(
  dbUser: users,
  locale: string,
  currentPath: string
): void {
  const redirectPath = getOnboardingRedirect(
    dbUser.onboarding_status,
    !!dbUser.organization_id,
    locale,
    currentPath
  )

  if (redirectPath) {
    logger.info('Redirecting user based on onboarding status', {
      userId: dbUser.id,
      currentStatus: dbUser.onboarding_status,
      currentPath,
      redirectPath
    })
    redirect(redirectPath)
  }
}