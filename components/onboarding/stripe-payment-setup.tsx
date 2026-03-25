/**
 * @fileoverview Stripe payment setup component for onboarding step 3.
 *
 * @remarks
 * Renders the pricing summary and initiates Stripe hosted checkout for the
 * organization's subscription based on selected locations.
 *
 * Key exports:
 * - `StripePaymentSetup`
 *
 * Relevant types:
 * - `StripePaymentSetupProps`
 */
'use client'

import { useCallback, useMemo, useState } from 'react'
import { AlertCircle, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createStripeCheckoutSession } from '@/server/actions/stripe/checkout.action'
import type { organizations, locations, connections, opening_hours } from '@/app/generated/prisma'
import { ErrorBanner } from './ErrorBanner'

interface SerializedUser {
  id: string
  firstName: string | null
  lastName: string | null
  primaryEmailAddress: {
    emailAddress?: string
  } | null
  imageUrl: string
}

interface UserDataForAPI {
  id: string
  firstName: string | null
  lastName: string | null
  emailAddresses: Array<{
    id: string
    emailAddress: string
  }>
  imageUrl: string
  primaryEmailAddress: {
    id: string
    emailAddress: string
  } | null
  publicMetadata: Record<string, unknown>
  privateMetadata: Record<string, unknown>
}

type SerializedOrganization = Omit<organizations, 'created_at' | 'updated_at'> & {
  created_at?: string
  updated_at?: string
}

type SerializedLocation = Omit<
  locations,
  'lat' | 'lng' | 'created_at' | 'updated_at' | 'opening_hours' | 'connections'
> & {
  lat: number | null
  lng: number | null
  created_at?: string
  updated_at?: string
  opening_hours?: (Omit<opening_hours, 'created_at' | 'updated_at'> & {
    created_at?: string
    updated_at?: string
  })[]
  connections?: (Omit<connections, 'created_at' | 'updated_at'> & {
    created_at?: string
    updated_at?: string
  })
}

type StripePriceInfo = {
  unitPrice: number
  currencyCode: string
  trialDays: number
}

export interface StripePaymentSetupProps {
  user: SerializedUser
  userDataForAPI: UserDataForAPI
  organization: SerializedOrganization
  selectedLocations: SerializedLocation[]
  userId: string
  locale: string
  errorBannerName?: string
  onboardingStatus?: string
  priceInfo?: StripePriceInfo | null
}

const currencySymbols: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  CAD: 'C$',
  AUD: 'A$'
}

export function StripePaymentSetup({
  selectedLocations,
  locale,
  errorBannerName,
  priceInfo = null
}: StripePaymentSetupProps) {
  const t = useTranslations('onboarding.step3')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const locationCount = selectedLocations.length
  const pricePerLocation = priceInfo?.unitPrice ?? 29.99
  const currencyCode = priceInfo?.currencyCode ?? 'EUR'
  const trialDays = priceInfo?.trialDays ?? 15
  const totalMonthlyPrice = locationCount * pricePerLocation
  const currencySymbol = currencySymbols[currencyCode] || currencyCode

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const successRedirectUrl = `${appBaseUrl}/${locale}/onboarding/complete?billing=success`
  const returnRedirectUrl = `${appBaseUrl}/${locale}/onboarding/step-3`

  const locationNames = useMemo(
    () =>
      selectedLocations.map(location => ({
        id: location.id,
        name: location.name || t('pricing.unnamedLocation')
      })),
    [selectedLocations, t]
  )

  const handleCheckout = useCallback(async () => {
    if (locationCount === 0) {
      setError(t('errors.checkoutError'))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const checkoutResult = await createStripeCheckoutSession({
        locale,
        quantity: locationCount,
        successUrl: successRedirectUrl,
        cancelUrl: returnRedirectUrl
      })

      if (!checkoutResult.success) {
        setError(checkoutResult.error ?? t('errors.checkoutError'))
        setIsLoading(false)
        return
      }

      window.location.assign(checkoutResult.url)
    } catch (checkoutError) {
      const message =
        checkoutError instanceof Error ? checkoutError.message : t('errors.checkoutError')
      setError(message)
      setIsLoading(false)
    }
  }, [locale, locationCount, returnRedirectUrl, successRedirectUrl, t])

  return (
    <div className="space-y-6">
      {errorBannerName && <ErrorBanner error_banner_name={errorBannerName} />}

      <Card>
        <CardHeader>
          <CardTitle>{t('pricing.title')}</CardTitle>
          <CardDescription>
            {t('pricing.description', { count: locationCount })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {t('pricing.locationsIncluded')}
            </p>
            <ul className="mt-2 space-y-1">
              {locationNames.map(location => (
                <li key={location.id} className="text-sm">
                  {location.name}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              {t('pricing.calculation', { count: locationCount, price: pricePerLocation })}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-medium">{t('pricing.monthlyTotal')}</span>
              <span className="text-lg font-semibold">
                {currencySymbol}
                {totalMonthlyPrice.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span>{t('pricing.features.monitoring')}</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span>{t('pricing.features.aiResponses')}</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span>{t('pricing.features.dashboard')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('payment.title')}</CardTitle>
          <CardDescription>{t('payment.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button className="w-full" size="lg" onClick={handleCheckout} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('payment.processing')}
              </>
            ) : (
              t('payment.activateButton', { price: pricePerLocation.toFixed(2) })
            )}
          </Button>

          <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Lock className="h-3 w-3" />
              <span>
                {t('payment.trialInfo', {
                  price: pricePerLocation.toFixed(2),
                  days: trialDays
                })}
              </span>
            </div>
            <Badge variant="outline">{t('payment.encryptedByStripe')}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
