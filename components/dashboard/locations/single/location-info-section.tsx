import { getTranslations } from "next-intl/server"
import { MapPin, Building2, Clock, Globe, Phone, Calendar, User, Edit, ExternalLink, Link as LinkIcon } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDate, formatCategory } from "@/lib/utils"
import { LocationEditSheet } from "@/components/dashboard/locations/single/dialogs/location-edit-sheet"
import type { SerializedLocationWithFullRelations } from "@/lib/prisma-types"

interface LocationInfoSectionProps {
  location: SerializedLocationWithFullRelations
  locale: string
}


/**
 * Location Info Section - Server Component
 * 
 * Displays comprehensive location information with improved structure:
 * - Basic info card at top
 * - Two-column detailed layout below: Location details (left) | Organization info (right)
 * - Edit button for location information
 * - Hover links for users, organization, and website
 */
export async function LocationInfoSection({ location, locale }: LocationInfoSectionProps) {
  const t = await getTranslations({ locale, namespace: "backoffice.locations.detail.info" })
  const tWeekdays = await getTranslations({ locale, namespace: "common.weekdays" })

  const organization = location.connections?.organizations
  const createdBy = location.users_locations_created_byTousers
  const updatedBy = location.users_locations_updated_byTousers
  const createdByName = createdBy?.name && createdBy?.lastname 
    ? `${createdBy.name} ${createdBy.lastname}` 
    : createdBy?.name || createdBy?.email || "—"
  const updatedByName = updatedBy?.name && updatedBy?.lastname 
    ? `${updatedBy.name} ${updatedBy.lastname}` 
    : updatedBy?.name || updatedBy?.email || "—"

  return (
    <div className="space-y-6">
      {/* Two Columns Layout */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        {/* Left Column: Basic Info + Address & Contact + Opening Hours */}
        <div className="space-y-6 flex flex-col">
          {/* Basic Information */}
          <div className="space-y-4 flex flex-col flex-1">
            <div className="flex items-center justify-between px-2 min-h-[32px]">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                <h2 className="text-lg font-semibold">{t("basicInfo")}</h2>
              </div>
              <LocationEditSheet location={location}>
                <Button variant="outline" size="sm">
                  <Edit className="mr-2 h-4 w-4" />
                  {t("editLocation")}
                </Button>
              </LocationEditSheet>
            </div>
            <Card className="flex-1">
              <CardContent className="p-6">
                <div className="space-y-3">
                  {/* Name */}
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("name")}</span>
                    <span className="text-sm font-medium">{location.name || "—"}</span>
                  </div>

                  {/* Status */}
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("status")}</span>
                    <Badge 
                      variant={location.status === "active" ? "default" : "secondary"}
                      className={location.status === "active" ? "bg-active text-active-foreground" : ""}
                    >
                      {location.status === "active" ? t("active") : t("inactive")}
                    </Badge>
                  </div>

                  {/* Verified */}
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("verified")}</span>
                    <Badge 
                      variant={location.verified ? "default" : "outline"}
                      className={location.verified ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""}
                    >
                      {location.verified ? t("yes") : t("no")}
                    </Badge>
                  </div>

                  {/* Category */}
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("category")}</span>
                    <Badge variant="outline" className="text-xs">
                      {location.primary_category ? formatCategory(location.primary_category) : "—"}
                    </Badge>
                  </div>

                  {/* Reviews Processed */}
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">{t("reviewsProcessed")}</span>
                    <span className="text-sm font-medium font-mono">{location.reviews_processed || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Address & Contact */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2">
              <Building2 className="h-5 w-5" />
              <h2 className="text-lg font-semibold">{t("addressAndContact")}</h2>
            </div>
            <Card>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {/* Address */}
                  <div className="flex justify-between items-start py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("address")}</span>
                    <span className="text-sm font-medium text-right max-w-[60%]">
                      {(() => {
                        const parts = [
                          location.address_line1,
                          location.address_line2,
                          [location.city, location.region, location.postal_code].filter(Boolean).join(", "),
                          location.country?.toUpperCase()
                        ].filter(Boolean)
                        return parts.length > 0 ? parts.join(", ") : "—"
                      })()}
                    </span>
                  </div>

                  {/* Phone */}
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {t("phone")}
                    </span>
                    <span className="text-sm font-medium">{location.phone || "—"}</span>
                  </div>

                  {/* Website with hover link */}
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {t("website")}
                    </span>
                    {location.website ? (
                      <a
                        href={location.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group/website-link inline-flex items-center gap-1.5 text-sm font-medium text-active hover:underline"
                      >
                        <span className="truncate max-w-[200px]">{location.website}</span>
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover/website-link:opacity-100 transition-opacity shrink-0" />
                      </a>
                    ) : (
                      <span className="text-sm font-medium">—</span>
                    )}
                  </div>

                  {/* Google Location ID */}
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">{t("googleLocationId")}</span>
                    <span className="text-xs font-mono text-muted-foreground truncate max-w-[60%]">
                      {location.google_location_id || "—"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Opening Hours */}
          {location.opening_hours && location.opening_hours.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-2">
                <Clock className="h-5 w-5" />
                <h2 className="text-lg font-semibold">{t("openingHours")}</h2>
              </div>
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    {(() => {
                      // Group opening hours by weekday
                      const groupedByWeekday = new Map<string, typeof location.opening_hours>()
                      for (const hour of location.opening_hours) {
                        if (!groupedByWeekday.has(hour.weekday)) {
                          groupedByWeekday.set(hour.weekday, [])
                        }
                        groupedByWeekday.get(hour.weekday)!.push(hour)
                      }
                      
                      // Order weekdays
                      const weekdayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                      const orderedWeekdays = weekdayOrder.filter(day => groupedByWeekday.has(day))
                      
                      return orderedWeekdays.map((weekday, dayIndex) => {
                        const hours = groupedByWeekday.get(weekday)!
                        return (
                          <div 
                            key={weekday}
                            className={`flex justify-between items-center py-2 ${dayIndex < orderedWeekdays.length - 1 ? 'border-b border-border/50' : ''}`}
                          >
                            <span className="text-sm text-muted-foreground">
                              {tWeekdays(weekday)}
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {hours.map((hour) => {
                                const timeLabel = hour.open_time && hour.close_time 
                                  ? `${hour.open_time} - ${hour.close_time}`
                                  : hour.open_time 
                                    ? `${t("from")} ${hour.open_time}`
                                    : hour.close_time
                                      ? `${t("until")} ${hour.close_time}`
                                      : "—"
                                
                                return (
                                  <Badge 
                                    key={hour.id}
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {timeLabel}
                                  </Badge>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Right Column: Organization + System Info */}
        <div className="space-y-6 flex flex-col">
          {/* Organization */}
          <div className="space-y-4 flex flex-col flex-1">
            <div className="flex items-center justify-between px-2 min-h-[32px]">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                <h2 className="text-lg font-semibold">{t("organization")}</h2>
              </div>
              <div className="w-[120px]"></div>
            </div>

            {organization ? (
            <Card className="flex-1">
              <CardContent className="p-6">
                <div className="space-y-3">
                  {/* Organization Name with hover link */}
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("organizationName")}</span>
                    <Link
                      href={`/backoffice/organizations/${organization.id}`}
                      className="group/org-link inline-flex items-center gap-1.5 text-sm font-medium hover:text-active transition-colors"
                    >
                      <span>{organization.business_name || "—"}</span>
                      <LinkIcon className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/org-link:opacity-100 transition-opacity" />
                    </Link>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("connectionId")}</span>
                    <span className="text-xs font-mono text-muted-foreground truncate max-w-[60%]">
                      {location.connections?.external_account_id || "—"}
                    </span>
                  </div>

                  {organization.email && (
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">{t("organizationEmail")}</span>
                      <span className="text-sm font-medium truncate max-w-[60%]">{organization.email}</span>
                    </div>
                  )}

                  {organization.primary_phone && (
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">{t("organizationPhone")}</span>
                      <span className="text-sm font-medium">{organization.primary_phone}</span>
                    </div>
                  )}

                  {/* Active Locations Count */}
                  {organization.subscriptions && (
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">{t("activeLocations")}</span>
                      <span className="text-sm font-medium font-mono">{organization.subscriptions.location_active_count || 0}</span>
                    </div>
                  )}

                  {/* Reviews Processed */}
                  {location.reviews_processed !== undefined && (
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">{t("reviewsProcessed")}</span>
                      <span className="text-sm font-medium font-mono">{location.reviews_processed || 0}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">
                    {t("noOrganization")}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* System Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2">
              <Calendar className="h-5 w-5" />
              <h2 className="text-lg font-semibold">{t("systemInfo")}</h2>
            </div>
            <Card>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {/* Created By with hover link */}
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {t("createdBy")}
                    </span>
                    {createdBy ? (
                      <Link
                        href={`/backoffice/users/${createdBy.id}`}
                        className="group/user-link inline-flex items-center gap-1.5 text-sm font-medium hover:text-active transition-colors"
                      >
                        <span>{createdByName}</span>
                        <LinkIcon className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/user-link:opacity-100 transition-opacity" />
                      </Link>
                    ) : (
                      <span className="text-sm font-medium">{createdByName}</span>
                    )}
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">{t("createdAt")}</span>
                    <span className="text-sm font-medium">{formatDate(location.created_at)}</span>
                  </div>

                  {/* Updated By with hover link */}
                  {updatedBy && (
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">{t("updatedBy")}</span>
                      <Link
                        href={`/backoffice/users/${updatedBy.id}`}
                        className="group/user-link inline-flex items-center gap-1.5 text-sm font-medium hover:text-active transition-colors"
                      >
                        <span>{updatedByName}</span>
                        <LinkIcon className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/user-link:opacity-100 transition-opacity" />
                      </Link>
                    </div>
                  )}

                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">{t("updatedAt")}</span>
                    <span className="text-sm font-medium">{formatDate(location.updated_at)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
