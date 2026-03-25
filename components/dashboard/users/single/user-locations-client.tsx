"use client"

import { MapPin, Settings, Bot } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Link } from "@/i18n/navigation"
import { LocationPromptContextSheet } from "./dialogs/location-prompt-context-sheet"
import { LocationConfigDialog } from "./dialogs/location-config-dialog"
import { formatCategory, formatAddress } from "@/lib/utils"
import { DataTablePagination } from "@/components/dashboard/shared/table/data-table-pagination"
import { useTranslations } from "next-intl"
import type { UserWithOrganization, SerializedLocationWithConnection } from "@/lib/prisma-types"
import type { PaginationMeta } from "@/lib/api-types"

interface UserLocationsClientProps {
  locations: SerializedLocationWithConnection[]
  pagination: PaginationMeta
  user: UserWithOrganization
}

/**
 * UserLocationsClient - Client Component
 * 
 * Displays Google My Business locations managed by the organization.
 * Renders cards with pagination support.
 * 
 * Architecture:
 * - Client Component: Receives data from UserLocationsServer
 * - Handles UI rendering and pagination
 * - Uses useTranslations for i18n (Client Component API)
 */
export function UserLocationsClient({ 
  locations, 
  pagination, 
  user 
}: UserLocationsClientProps) {
  const t = useTranslations("backoffice.users.detail.locations")

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {t("title")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("count", { count: pagination.total })}
          </p>
        </div>
      </div>

      {locations.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              {t("empty")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {locations.map((location) => (
              <Card key={location.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        <Badge 
                          variant={location.status === "active" ? "default" : "secondary"}
                          className={location.status === "active" ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""}
                        >
                          {location.status === "active" ? t("active") : t("inactive")}
                        </Badge>
                        <CardTitle className="text-base font-medium">
                          {location.name || t("unnamed")}
                        </CardTitle>
                      </div>
                      
                      {location.primary_category && (
                        <Badge variant="outline" className="text-xs">
                          {formatCategory(location.primary_category) || t("noCategory")}
                        </Badge>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {/* Configuration Button */}
                      <Tooltip>
                        <LocationConfigDialog 
                          locationId={location.id}
                          locationName={location.name || t("unnamed")}
                          isActive={location.status === "active"}
                          userId={user.id}
                        >
                          <TooltipTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="icon"
                              className="h-8 w-8"
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                        </LocationConfigDialog>
                        <TooltipContent>
                          <p>{t("configTooltip")}</p>
                        </TooltipContent>
                      </Tooltip>

                      {/* AI Prompt Context Button */}
                      <Tooltip>
                        <LocationPromptContextSheet locationId={location.id}>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="icon"
                              className="h-8 w-8"
                            >
                              <Bot className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                        </LocationPromptContextSheet>
                        <TooltipContent>
                          <p>{t("settingsTooltip")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <Separator className="mb-4" />
                  
                  {/* Address and View Button */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-2 flex-1">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-sm text-muted-foreground">
                        {formatAddress({
                          address_line1: location.address_line1,
                          city: location.city,
                          region: location.region,
                          postal_code: location.postal_code
                        }) || t("noAddress")}
                      </p>
                    </div>
                    
                    <Button
                      asChild
                      variant="link"
                      className="text-sm text-[var(--active)] hover:text-[var(--active)]/90 p-0 h-auto"
                    >
                      <Link href={`/backoffice/locations/${location.id}`}>
                        {t("view")} »
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <DataTablePagination 
            pagination={pagination}
            mode="server"
          />
        </>
      )}
    </div>
  )
}

