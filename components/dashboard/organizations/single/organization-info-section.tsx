/**
 * @fileoverview Server component that renders organization details and subscription metadata.
 *
 * @remarks
 * - Shows business profile, system identifiers, and subscription period information.
 * - Formats localized dates, relative times, and status badges for organization details.
 *
 * @exports OrganizationInfoSection
 */
import { getTranslations } from "next-intl/server"
import { Building2, CreditCard, Calendar, Users, Edit } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/ui/shadcn-io/copy-button"
import { OrganizationEditSheet } from "@/components/dashboard/organizations/single/dialogs/organization-edit-sheet"
import { formatDate, formatRelativeTime } from "@/lib/utils"
import type { OrganizationWithRelations } from "@/lib/prisma-types"
import flags from "react-phone-number-input/flags"
import type { Country } from "react-phone-number-input"

interface OrganizationInfoSectionProps {
  organization: OrganizationWithRelations
}

function FlagComponent({ country }: { country: string | null }) {
  if (!country) return <span className="text-muted-foreground">—</span>
  
  const countryCode = country.toUpperCase() as Country
  const Flag = flags[countryCode]
  
  if (!Flag) return <span className="text-sm">{country}</span>
  
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-4 w-6 overflow-hidden rounded-sm bg-foreground/20 [&_svg:not([class*='size-'])]:size-full">
        <Flag title={countryCode} />
      </span>
      <span className="text-sm font-medium">{countryCode}</span>
    </div>
  )
}

function getOrganizationAge(createdAt: Date | null | undefined, tTime: (key: string, values?: Record<string, number>) => string): string {
  if (!createdAt) return "—"
  return formatRelativeTime(createdAt, tTime)
}

/**
 * Get subscription badge with proper styling
 * Handles different subscription statuses with appropriate badge variants
 */
function getSubscriptionBadge(subscription: { status: string | null } | null | undefined, tInfo: (key: string) => string, tSettings: (key: string) => string) {
  if (!subscription?.status) {
    return <Badge variant="secondary">{tSettings("noSubscription")}</Badge>
  }

  const status = subscription.status
  const variant = {
    active: "default",
    trialing: "secondary", 
    past_due: "destructive",
    cancelled: "outline",
    inactive: "outline",
    unpaid: "destructive"
  }[status] as "default" | "secondary" | "destructive" | "outline"

  return (
    <Badge variant={variant} className={status === "active" ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""}>
      {tInfo(`subscriptionStatus.${status}`)}
    </Badge>
  )
}

/**
 * Get next payment/billing date information
 * Uses periodEnd from the subscription model
 */
function getNextPaymentInfo(subscription: { periodEnd: Date | null } | null | undefined): string {
  if (!subscription?.periodEnd) return "—"
  
  const formattedDate = formatDate(subscription.periodEnd)
  return formattedDate
}

/**
 * Get current period information
 * Uses explicit periodStart/periodEnd values when available.
 * Falls back to one-month range ending at periodEnd if periodStart is missing.
 */
function getCurrentPeriod(subscription: { periodStart: Date | null; periodEnd: Date | null } | null | undefined): string {
  if (!subscription?.periodEnd) {
    return "—"
  }
  
  const endDate = new Date(subscription.periodEnd)
  const startDate = subscription.periodStart ? new Date(subscription.periodStart) : new Date(endDate)
  if (!subscription.periodStart) {
    startDate.setMonth(startDate.getMonth() - 1)
  }
  
  const start = formatDate(startDate)
  const end = formatDate(endDate)
  
  return `${start} - ${end}`
}

/**
 * Organization Info Section - Server Component
 * 
 * Displays organization and subscription information in a two-column layout.
 */
export async function OrganizationInfoSection({ organization }: OrganizationInfoSectionProps) {
  const tInfo = await getTranslations("backoffice.organizations.detail.info")
  const tTime = await getTranslations("common.time")
  const tSettings = await getTranslations("backoffice.settings")

  const usersCount = organization.users_users_organization_idToorganizations?.length || 0
  const subscription = organization.subscriptions

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-stretch">
      {/* Organization Information Column */}
      <div className="h-full space-y-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <h2 className="text-lg font-semibold">{tInfo("basicInfo")}</h2>
          </div>
          <OrganizationEditSheet organization={organization}>
            <Button variant="outline" size="sm">
              <Edit className="mr-2 h-4 w-4" />
              {tInfo("editOrganization")}
            </Button>
          </OrganizationEditSheet>
        </div>
        <Card className="h-full">
          <CardContent className="p-6">
            <div className="space-y-6">
              {/* Business Information Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {tInfo("businessInfo")}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{tInfo("businessName")}</span>
                    <span className="text-sm font-medium">{organization.business_name || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{tInfo("email")}</span>
                    <span className="text-sm font-medium truncate">{organization.email || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{tInfo("phone")}</span>
                    <span className="text-sm font-medium">{organization.primary_phone || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{tInfo("businessId")}</span>
                    <span className="text-sm font-medium">{organization.business_id || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{tInfo("taxId")}</span>
                    <span className="text-sm font-medium">{organization.tax_identifier || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{tInfo("country")}</span>
                    <FlagComponent country={organization.country} />
                  </div>
                  <div className="flex justify-between items-start py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{tInfo("address")}</span>
                    <span className="text-sm font-medium text-right max-w-[60%]">
                      {organization.business_address || 
                       (organization.first_line_of_address && organization.city 
                        ? `${organization.first_line_of_address}, ${organization.city}${organization.region ? `, ${organization.region}` : ''}, ${organization.zip_code}` 
                        : "—")}
                    </span>
                  </div>
                </div>
              </div>

              {/* System Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {tInfo("systemInfo")}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{tInfo("clerkOrgId")}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">
                        {organization.organization_clerk_id || "—"}
                      </span>
                      {organization.organization_clerk_id && (
                        <CopyButton
                          content={organization.organization_clerk_id}
                          variant="ghost"
                          size="sm"
                          aria-label={tInfo("copyClerkOrgId")}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">{tInfo("createdAt")}</span>
                    <span className="text-sm font-medium">
                      {formatDate(organization.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscription Information Column */}
      <div className="h-full space-y-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            <h2 className="text-lg font-semibold">{tInfo("subscription.title")}</h2>
          </div>
        </div>
        <Card className="h-full">
          <CardContent className="p-6">
            <div className="space-y-6">
              {/* Subscription Information */}
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{tInfo("subscription.status")}</span>
                    <div>{getSubscriptionBadge(subscription, tInfo, tSettings)}</div>
                  </div>
                  {subscription?.stripe_subscription_id && (
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">{tInfo("subscription.paddleId")}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground truncate max-w-[120px]">
                          {subscription.stripe_subscription_id}
                        </span>
                        <CopyButton
                          content={subscription.stripe_subscription_id}
                          variant="ghost"
                          size="sm"
                          aria-label={tInfo("subscription.copyPaddleId")}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{tInfo("subscription.currentPeriod")}</span>
                    <span className="text-sm font-medium">{getCurrentPeriod(subscription)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{tInfo("subscription.nextPayment")}</span>
                    <span className="text-sm font-medium">{getNextPaymentInfo(subscription)}</span>
                  </div>
                  {subscription?.location_active_count !== undefined && (
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">{tInfo("subscription.activeLocations")}</span>
                      <span className="text-sm font-medium">{subscription.location_active_count}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{tInfo("subscription.users")}</span>
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {tInfo("subscription.usersCount", { count: usersCount })}
                      </span>
                    </div>
                  </div>
                  {subscription?.created_at && (
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-muted-foreground">{tInfo("subscription.createdAt")}</span>
                      <span className="text-sm font-medium">{formatDate(subscription.created_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Statistics */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {tInfo("statistics")}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{tInfo("subscription.antiquity")}</span>
                    <span className="text-sm font-medium">{getOrganizationAge(organization.created_at, tTime)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">{tInfo("createdAt")}</span>
                    <span className="text-sm font-medium">
                      {formatDate(organization.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
