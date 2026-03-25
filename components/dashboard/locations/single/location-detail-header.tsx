import { ArrowLeft, MapPin, Settings } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { formatCountryName } from "@/lib/utils"
import { LocationConfigDialog } from "@/components/dashboard/users/single/dialogs/location-config-dialog"
import { getTranslations } from "next-intl/server"
import type { SerializedLocationWithFullRelations } from "@/lib/prisma-types"

interface LocationDetailHeaderProps {
  location: SerializedLocationWithFullRelations
  locale: string
}

/**
 * Server component that displays location header information.
 * 
 * Receives location data as prop to avoid redundant queries.
 * Renders location name, city/country, navigation controls, and action buttons.
 * Uses formatCountryName for localized country display.
 */
export async function LocationDetailHeader({ location, locale }: LocationDetailHeaderProps) {
  const t = await getTranslations({ locale, namespace: "backoffice.locations.detail" })
  
  const displayName = location.name || location.google_location_id || "Unnamed Location"
  
  // Format country code to localized country name
  const countryName = location.country ? formatCountryName(location.country, locale) : null
  const locationParts = [location.city, countryName].filter(Boolean)
  const locationText = locationParts.length > 0 ? locationParts.join(', ') : null
  
  // Get created_by user ID for LocationConfigDialog
  const userId = location.created_by || null
  
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/backoffice/locations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-[var(--active)]/10 p-2">
            <MapPin className="h-6 w-6 text-[var(--active)]" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{displayName}</h1>
            {locationText && (
              <p className="text-sm text-muted-foreground">
                {locationText}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Location Config Dialog - Client Component */}
        {userId && (
          <LocationConfigDialog
            locationId={location.id}
            locationName={displayName}
            isActive={location.status === "active"}
            userId={userId}
          >
            <Button variant="outline" size="sm">
              <Settings className="mr-2 h-4 w-4" />
              {t("configureLocation")}
            </Button>
          </LocationConfigDialog>
        )}
      </div>
    </div>
  )
} 

