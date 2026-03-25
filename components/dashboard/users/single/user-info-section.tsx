/**
 * @fileoverview Server component that renders the user's personal and organization details.
 * 
 * @remarks
 * - Lists user info, contact details, system metadata, and organization subscription stats.
 * - Delegates organization users, timestamps, and translation helpers to structured sections.
 * 
 * @exports UserInfoSection
 */
import { getTranslations } from "next-intl/server"
import { User, Edit, Building2, ExternalLink, CreditCard, Users, Calendar } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { UserEditSheet } from "@/components/dashboard/users/single/dialogs/user-edit-sheet"
import { CopyButton } from "@/components/ui/shadcn-io/copy-button"
import { formatDate, formatRelativeTime } from "@/lib/utils"
import type { UserWithOrganization } from "@/lib/prisma-types"
import flags from "react-phone-number-input/flags"
import { getCountryCallingCode, type Country } from "react-phone-number-input"

interface UserInfoSectionProps {
  user: UserWithOrganization
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
 * User Info Section - Server Component
 * 
 * Displays user and organization information in a two-column layout.
 */
export async function UserInfoSection({ user }: UserInfoSectionProps) {
  const t = await getTranslations("backoffice.users")
  const tInfo = await getTranslations("backoffice.users.detail.info")
  const tTime = await getTranslations("common.time")
  const tSettings = await getTranslations("backoffice.settings")

  // Organization data
  const organization = user.organizations_users_organization_idToorganizations
  // Type-safe access to users array (included by findUserById but not in type definition)
  const organizationUsersCount = organization && 'users_users_organization_idToorganizations' in organization && Array.isArray(organization.users_users_organization_idToorganizations)
    ? organization.users_users_organization_idToorganizations.length
    : 0


  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr] lg:items-stretch">
      {/* User Information Column */}
      <div className="h-full space-y-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <h2 className="text-lg font-semibold">{t("detail.info.userInfo")}</h2>
          </div>
          <UserEditSheet user={user}>
            <Button variant="outline" size="sm">
              <Edit className="mr-2 h-4 w-4" />
              {t("detail.info.editUser")}
            </Button>
          </UserEditSheet>
        </div>
        <Card className="h-full">
          <CardContent className="p-6">
            <div className="space-y-6">
              {/* Personal Information Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("detail.info.personalInfo")}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("detail.info.username")}</span>
                    <span className="text-sm font-medium">{user.username}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("detail.info.name")}</span>
                    <span className="text-sm font-medium">{user.name || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("detail.info.lastname")}</span>
                    <span className="text-sm font-medium">{user.lastname || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("detail.info.contactInfo")}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("detail.info.email")}</span>
                    <span className="text-sm font-medium truncate">{user.email || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("detail.info.waId")}</span>
                    <span className="text-sm font-medium font-mono">{user.wa_id}</span>
                  </div>
                </div>
              </div>

              {/* System Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("detail.info.systemInfo")}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("detail.info.role")}</span>
                    <Badge variant="outline" className="text-xs">{t(`roles.${user.role}`)}</Badge>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("detail.info.onboardingStatus")}</span>
                    <Badge 
                      variant={user.onboarding_status === "done" ? "default" : "secondary"}
                      className={`text-xs ${user.onboarding_status === "done" ? "bg-[var(--active)] text-[var(--active-foreground)]" : ""}`}
                    >
                      {t(`onboardingStatus.${user.onboarding_status}`)}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("detail.info.clerkId")}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground truncate">{user.clerk_id || "—"}</span>
                      {user.clerk_id && (
                        <CopyButton
                          content={user.clerk_id}
                          variant="ghost"
                          size="sm"
                          aria-label={t("detail.info.copyClerkId")}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("detail.info.timestamps")}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("detail.info.createdAt")}</span>
                    <span className="text-sm font-medium">
                      {formatDate(user.created_at)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">{t("detail.info.updatedAt")}</span>
                    <span className="text-sm font-medium">
                      {formatDate(user.updated_at)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Organization Information Column */}
      <div className="h-full space-y-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <h2 className="text-lg font-semibold">{t("detail.info.organizationInfo")}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/backoffice/organizations/${organization?.id}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("detail.info.subscription.viewOrganization")}
              </Link>
            </Button>
          </div>
        </div>
        {organization ? (
          <Card className="h-full">
            <CardContent className="p-6">
              <div className="space-y-6">
                {/* Business Information */}
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
                      <span className="text-sm font-medium">{organization.email || "—"}</span>
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
                      <span className="text-sm text-muted-foreground">{tInfo("taxIdentifier")}</span>
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
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-muted-foreground">{tInfo("organizationClerkId")}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground truncate">{organization.organization_clerk_id || "—"}</span>
                        {organization.organization_clerk_id && (
                          <CopyButton
                            content={organization.organization_clerk_id}
                            variant="ghost"
                            size="sm"
                            aria-label={tInfo("copyOrganizationClerkId")}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subscription Information */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    {tInfo("subscription.title")}
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">{tInfo("subscription.status")}</span>
                      <div>{getSubscriptionBadge(organization.subscriptions, tInfo, tSettings)}</div>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">{tInfo("subscription.currentPeriod")}</span>
                      <span className="text-sm font-medium">{getCurrentPeriod(organization.subscriptions)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">{tInfo("subscription.nextPayment")}</span>
                      <span className="text-sm font-medium">{getNextPaymentInfo(organization.subscriptions)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">{tInfo("subscription.users")}</span>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {tInfo("subscription.usersCount", { 
                            count: organizationUsersCount
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">{tInfo("subscription.paddleId")}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground truncate">{organization.subscriptions?.stripe_subscription_id || "—"}</span>
                        {organization.subscriptions?.stripe_subscription_id && (
                          <CopyButton
                            content={organization.subscriptions.stripe_subscription_id}
                            variant="ghost"
                            size="sm"
                            aria-label={tInfo("copyPaddleId")}
                          />
                        )}
                      </div>
                    </div>
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
        ) : (
          <Card className="h-full">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                {t("detail.info.noOrganization")}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

