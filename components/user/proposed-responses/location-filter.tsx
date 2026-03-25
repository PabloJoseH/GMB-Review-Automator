"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { MapPin, Check } from "lucide-react"

interface LocationFilterProps {
  locations: Array<{ id: string; name: string | null }>
  currentLocationId?: string
  onLocationChange: (locationId: string | null) => void
}

/**
 * LocationFilter - Client Component
 * 
 * Dropdown filter for selecting a specific location or "all locations".
 * Similar to status filter in TableToolbar but for locations.
 */
export function LocationFilter({ 
  locations, 
  currentLocationId, 
  onLocationChange 
}: LocationFilterProps) {
  const t = useTranslations("user.proposedResponses")

  const hasActiveFilter = !!currentLocationId

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button 
              variant={hasActiveFilter ? "default" : "outline"} 
              size="icon"
              className={`shrink-0 ${hasActiveFilter ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""}`}
            >
              <MapPin className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t("locationFilterTooltip")}</p>
        </TooltipContent>
      </Tooltip> 
      <PopoverContent 
        className="w-auto min-w-56 max-w-[calc(100vw-2rem)] sm:max-w-md" 
        align="end"
        side="bottom"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">{t("filterByLocation")}</h4>
            <div className="space-y-1">
              <Button
                variant={!currentLocationId ? "secondary" : "ghost"}
                size="sm"
                className="w-full justify-start"
                onClick={() => onLocationChange(null)}
              >
                {!currentLocationId && <Check className="h-4 w-4 mr-2" />}
                {t("allLocations")}
              </Button>
              {locations.map((location) => (
                <Button
                  key={location.id}
                  variant={currentLocationId === location.id ? "secondary" : "ghost"}
                  size="sm"
                  className="w-full justify-start text-left whitespace-normal"
                  onClick={() => onLocationChange(location.id)}
                >
                  {currentLocationId === location.id && (
                    <Check className="h-4 w-4 mr-2 shrink-0" />
                  )}
                  <span className="break-words">{location.name || t("unnamedLocation")}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

