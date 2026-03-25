"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { MapPin, Building2, Globe, Phone, Map, RefreshCw, AlertCircle } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { updateLocation } from "@/server/actions/supabase/locations.action"
import type { SerializedLocationWithFullRelations } from "@/lib/prisma-types"
import type { locations } from "@/app/generated/prisma"
import { createLogger } from "@/lib/logger"

const logger = createLogger('LOCATION-EDIT')

/**
 * LocationEditSheet Component
 * 
 * Features:
 * - Sheet modal for editing location information
 * - "Refresh Information" button (TODO: implement Google sync)
 * - Automatic revalidation on success via router.refresh()
 * - Toast notifications for success/error
 * - Fully internationalized
 * 
 * Design:
 * - Clean hierarchy with visual sections
 * - Icons for better UX and visual guidance
 * - Proper spacing and padding following design system
 * - Grouped related fields (basic info, address, contact)
 * - Responsive layout with proper padding
 */

interface LocationEditSheetProps {
  location: Pick<SerializedLocationWithFullRelations, 
    "id" | "name" | "address_line1" | "address_line2" | "city" | 
    "postal_code" | "region" | "country" | "primary_category" | 
    "website" | "phone" | "verified"
  >
  children: React.ReactNode
}

type LocationUpdate = Partial<{
  name: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  postal_code: string | null
  region: string | null
  country: string | null
  primary_category: string | null
  website: string | null
  phone: string | null
  verified: boolean | null
}>

export function LocationEditSheet({ location, children }: LocationEditSheetProps) {
  const t = useTranslations("backoffice.locations")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefreshFromGoogle = async () => {
    // TODO: Implement Google My Business sync
    setIsRefreshing(true)
    
    toast.info(t("edit.refreshInfo.todo"))
    
    setTimeout(() => {
      setIsRefreshing(false)
    }, 1000)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const formData = new FormData(e.currentTarget)
    
    const updateData: LocationUpdate = {
      name: formData.get("name") as string || null,
      address_line1: formData.get("address_line1") as string || null,
      address_line2: formData.get("address_line2") as string || null,
      city: formData.get("city") as string || null,
      postal_code: formData.get("postal_code") as string || null,
      region: formData.get("region") as string || null,
      country: formData.get("country") as string || null,
      primary_category: formData.get("primary_category") as string || null,
      website: formData.get("website") as string || null,
      phone: formData.get("phone") as string || null,
    }

    setIsPending(true)

    try {
      const result = await updateLocation(location.id, updateData as Omit<locations, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'status'>)
      
      if (result.success) {
        toast.success(t("edit.success"))
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || t("edit.error"))
      }
    } catch (error) {
      toast.error(t("edit.error"))
      logger.error("Error updating location", error instanceof Error ? error : new Error(String(error)))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {/* Header */}
        <SheetHeader>
          <SheetTitle className="text-2xl font-semibold tracking-tight">
            {t("edit.title")}
          </SheetTitle>
          <SheetDescription className="text-base">
            {t("edit.description")}
          </SheetDescription>
        </SheetHeader>

        {/* Content */}
        <div className="px-4 pb-4">
          <Separator className="mb-6" />

          {/* Refresh Information Button */}
          <Alert className="mb-6 border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
              {t("edit.refreshInfo.description")}
            </AlertDescription>
          </Alert>

          <Button
            type="button"
            variant="outline"
            onClick={handleRefreshFromGoogle}
            disabled={isRefreshing || isPending}
            className="w-full mb-6 h-11"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? t("edit.refreshInfo.loading") : t("edit.refreshInfo.button")}
          </Button>

          <Separator className="mb-6" />

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Information Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{t("edit.sections.basic")}</span>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">
                  {t("detail.info.name")}
                </Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={location.name || ""}
                  disabled={isPending}
                  placeholder={t("edit.placeholders.name")}
                  className="h-10"
                />
              </div>

              {/* Primary Category */}
              <div className="space-y-2">
                <Label htmlFor="primary_category" className="text-sm font-medium">
                  {t("detail.info.category")}
                </Label>
                <Input
                  id="primary_category"
                  name="primary_category"
                  defaultValue={location.primary_category || ""}
                  disabled={isPending}
                  placeholder={t("edit.placeholders.category")}
                  className="h-10"
                />
              </div>
            </div>

            <Separator />

            {/* Address Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Map className="h-4 w-4" />
                <span>{t("edit.sections.address")}</span>
              </div>

              {/* Address Line 1 */}
              <div className="space-y-2">
                <Label htmlFor="address_line1" className="text-sm font-medium">
                  {t("edit.fields.addressLine1")}
                </Label>
                <Input
                  id="address_line1"
                  name="address_line1"
                  defaultValue={location.address_line1 || ""}
                  disabled={isPending}
                  placeholder={t("edit.placeholders.addressLine1")}
                  className="h-10"
                />
              </div>

              {/* Address Line 2 */}
              <div className="space-y-2">
                <Label htmlFor="address_line2" className="text-sm font-medium">
                  {t("edit.fields.addressLine2")}
                </Label>
                <Input
                  id="address_line2"
                  name="address_line2"
                  defaultValue={location.address_line2 || ""}
                  disabled={isPending}
                  placeholder={t("edit.placeholders.addressLine2")}
                  className="h-10"
                />
              </div>

              {/* City & Postal Code */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city" className="text-sm font-medium">
                    {t("edit.fields.city")}
                  </Label>
                  <Input
                    id="city"
                    name="city"
                    defaultValue={location.city || ""}
                    disabled={isPending}
                    placeholder={t("edit.placeholders.city")}
                    className="h-10"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="postal_code" className="text-sm font-medium">
                    {t("edit.fields.postalCode")}
                  </Label>
                  <Input
                    id="postal_code"
                    name="postal_code"
                    defaultValue={location.postal_code || ""}
                    disabled={isPending}
                    placeholder={t("edit.placeholders.postalCode")}
                    className="h-10"
                  />
                </div>
              </div>

              {/* Region & Country */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="region" className="text-sm font-medium">
                    {t("edit.fields.region")}
                  </Label>
                  <Input
                    id="region"
                    name="region"
                    defaultValue={location.region || ""}
                    disabled={isPending}
                    placeholder={t("edit.placeholders.region")}
                    className="h-10"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country" className="text-sm font-medium">
                    {t("edit.fields.country")}
                  </Label>
                  <Input
                    id="country"
                    name="country"
                    defaultValue={location.country || ""}
                    disabled={isPending}
                    placeholder={t("edit.placeholders.country")}
                    className="h-10"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Contact Information Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>{t("edit.sections.contact")}</span>
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium">
                  {t("detail.info.phone")}
                </Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  defaultValue={location.phone || ""}
                  disabled={isPending}
                  placeholder={t("edit.placeholders.phone")}
                  className="h-10"
                />
              </div>

              {/* Website */}
              <div className="space-y-2">
                <Label htmlFor="website" className="flex items-center gap-2 text-sm font-medium">
                  <Globe className="h-4 w-4" />
                  {t("detail.info.website")}
                </Label>
                <Input
                  id="website"
                  name="website"
                  type="url"
                  defaultValue={location.website || ""}
                  disabled={isPending}
                  placeholder={t("edit.placeholders.website")}
                  className="h-10"
                />
              </div>
            </div>

            <Separator />

            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="flex-1 h-11"
              >
                {t("edit.cancel")}
              </Button>
              <Button 
                type="submit" 
                disabled={isPending} 
                className="flex-1 h-11"
              >
                {isPending ? t("edit.saving") : t("edit.save")}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}

