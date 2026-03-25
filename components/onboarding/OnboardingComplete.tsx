/**
 * Onboarding Complete Client Component
 * 
 * Displays a success message when the user completes the onboarding process.
 * Shows next steps and user account summary.
 * 
 * Functionality:
 * - Shows completion success message with visual feedback
 * - Displays billing status if payment was completed
 * - Lists next steps for the user
 * - Shows user account summary with organization data
 * - Provides navigation to dashboard and support
 */

'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { organizations } from '@/app/generated/prisma'
import { useEffect, useRef } from 'react'
import { createLogger } from '@/lib/logger'

const logger = createLogger('ONBOARDING-COMPLETE')

interface SerializedUser {
  id: string
  firstName: string | null
  lastName: string | null
  primaryEmailAddress: {
    emailAddress?: string
  } | null
  imageUrl: string
  organizationId?: string | null
}

interface OnboardingCompleteProps {
  user: SerializedUser
  organization?: organizations | null
  organizationId?: string | null
  billingSuccess?: boolean
  whatsappUrl?: string
  reviewsSyncPayload?: {
    clerkUserId: string
    dbUserId: string
    userData: {
      id: string
      emailAddresses: Array<{ emailAddress: string }>
    }
  } | null
}

export function OnboardingComplete({ 
  user, 
  organization,
  organizationId, 
  billingSuccess,
  whatsappUrl = 'https://wa.me/',
  reviewsSyncPayload = null
}: OnboardingCompleteProps) {
  const t = useTranslations('onboarding.complete')
  const hasTriggeredReviewsSyncRef = useRef(false)

  useEffect(() => {
    if (!reviewsSyncPayload || hasTriggeredReviewsSyncRef.current) {
      return
    }

    hasTriggeredReviewsSyncRef.current = true

    fetch('/api/gmb/fetch-reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: reviewsSyncPayload.clerkUserId,
        dbUserId: reviewsSyncPayload.dbUserId,
        userData: reviewsSyncPayload.userData
      })
    })
      .then(async (response) => {
        if (!response.ok && response.status !== 409) {
          const payload = await response.json().catch(() => null)
          logger.warn('Failed to trigger fetch-reviews from onboarding complete', {
            status: response.status,
            payload
          })
        }
      })
      .catch((error) => {
        logger.error('Error triggering fetch-reviews from onboarding complete', error)
      })
  }, [reviewsSyncPayload])
  
  return (
    <div className="container mx-auto flex min-h-screen flex-col items-center px-4 py-12">
      <div className="w-full max-w-2xl space-y-8">
        
        {/* Success Header */}
        <div className="text-center">
          <div className="w-20 h-20 bg-[var(--active)]/20 dark:bg-[var(--active)]/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg 
              className="w-10 h-10 text-[var(--active)]" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M5 13l4 4L19 7" 
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('title')}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            {t('subtitle')}
          </p>
          {billingSuccess && (
            <div className="mt-4">
              <Badge className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700">
                💳 {t('subscriptionActive')}
              </Badge>
            </div>
          )}
        </div>

        {/* Configuration Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t('configuration.title')}
            </CardTitle>
            <CardDescription>
              {t('configuration.description')}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* What's Next */}
        <Card>
          <CardHeader>
            <CardTitle>{t('nextSteps.title')}</CardTitle>
            <CardDescription>
              {t('nextSteps.subtitle')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-[var(--active)]/20 dark:bg-[var(--active)]/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-[var(--active)]">1</span>
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{t('nextSteps.step1.title')}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('nextSteps.step1.description')}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                    {t('nextSteps.step1.noMessage')}{' '}
                    <a 
                      href="#" 
                      className="text-[var(--active)] hover:underline"
                      onClick={(e) => {
                        e.preventDefault()
                        window.open(whatsappUrl, '_blank')
                      }}
                    >
                      {t('nextSteps.step1.contactLink')}
                    </a>
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-[var(--active)]/20 dark:bg-[var(--active)]/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-[var(--active)]">2</span>
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{t('nextSteps.step2.title')}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('nextSteps.step2.description')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-[var(--active)]/20 dark:bg-[var(--active)]/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-[var(--active)]">3</span>
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{t('nextSteps.step3.title')}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('nextSteps.step3.description')}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Info Summary */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle>{t('accountSummary.title')}</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="bg-[var(--active)]/10 text-[var(--active)] border-[var(--active)]/30 dark:bg-[var(--active)]/20 dark:text-[var(--active)] dark:border-[var(--active)]/50">
                  {t('accountSummary.configured')}
                </Badge>
                {(organizationId || user.organizationId) && (
                  <Badge variant="outline" className="bg-[var(--active)]/10 text-[var(--active)] border-[var(--active)]/30 dark:bg-[var(--active)]/20 dark:text-[var(--active)] dark:border-[var(--active)]/50">
                    {t('accountSummary.organization')}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* User Info */}
              <div className="flex items-center gap-4">
                <Image 
                  src={user.imageUrl} 
                  alt="Avatar" 
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-full"
                />
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {user.firstName && user.lastName 
                      ? `${user.firstName} ${user.lastName}` 
                      : user.firstName || 'Usuario'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {user.primaryEmailAddress?.emailAddress}
                  </p>
                </div>
              </div>

              {/* Organization Info */}
              {organization && (
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                    {organization.business_name || 'Organización'}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                    {organization.business_id && (
                      <div>
                        <span className="font-medium">NIF/CIF:</span> {organization.business_id}
                      </div>
                    )}
                    {organization.email && (
                      <div>
                        <span className="font-medium">Email:</span> {organization.email}
                      </div>
                    )}
                    {organization.primary_phone && (
                      <div>
                        <span className="font-medium">Teléfono:</span> {organization.primary_phone}
                      </div>
                    )}
                    {organization.business_address && (
                      <div className="md:col-span-2">
                        <span className="font-medium">Dirección:</span> {organization.business_address}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>


        {/* Footer */}
        <div className="text-center space-y-4">
          <p className="text-sm text-gray-900 dark:text-white">
            {t('support.message')}
          </p>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-12 px-6 bg-[var(--active)] hover:bg-[var(--active)]/90 text-[var(--active-foreground)] rounded-lg transition-colors font-medium space-x-3"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            <span>{t('support.whatsappButton')}</span>
          </a>
        </div>
      </div>
    </div>
  )
}

