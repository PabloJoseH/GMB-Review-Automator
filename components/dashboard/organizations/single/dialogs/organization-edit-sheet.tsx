"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Building2, Mail, Phone, MapPin, Globe } from "lucide-react"
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
import { updateOrganization } from "@/server/actions/supabase/organizations.action"
import type { OrganizationWithRelations } from "@/lib/prisma-types"
import { createLogger } from "@/lib/logger"

const logger = createLogger('ORGANIZATION-EDIT')

/**
 * OrganizationEditSheet Component
 * 
 * Features:
 * - Sheet modal for editing organization information
 * - Automatic revalidation on success via router.refresh()
 * - Toast notifications for success/error
 * - Fully internationalized
 * 
 * Design:
 * - Clean hierarchy with visual sections
 * - Icons for better UX and visual guidance
 * - Proper spacing and padding following design system
 * - Grouped related fields (business info vs address info)
 * - Responsive layout with proper padding (SheetHeader p-4, content px-4)
 */

interface OrganizationEditSheetProps {
  organization: Pick<OrganizationWithRelations, "id" | "business_name" | "email" | "primary_phone" | "business_id" | "tax_identifier" | "country" | "first_line_of_address" | "city" | "region" | "zip_code">
  children: React.ReactNode
}

type OrganizationUpdate = Partial<{
  business_name: string
  email: string
  primary_phone: string
  business_id: string
  tax_identifier: string
  country: string
  first_line_of_address: string
  city: string
  region: string
  zip_code: string
}>

export function OrganizationEditSheet({ organization, children }: OrganizationEditSheetProps) {
  const t = useTranslations("backoffice.organizations")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const formData = new FormData(e.currentTarget)
    const businessNameValue = formData.get("business_name")
    const emailValue = formData.get("email")
    const phoneValue = formData.get("primary_phone")
    const businessIdValue = formData.get("business_id")
    const taxIdentifierValue = formData.get("tax_identifier")
    const countryValue = formData.get("country")
    const firstLineValue = formData.get("first_line_of_address")
    const cityValue = formData.get("city")
    const regionValue = formData.get("region")
    const zipCodeValue = formData.get("zip_code")

    const updateData: OrganizationUpdate = {
      business_name: businessNameValue && typeof businessNameValue === 'string' ? businessNameValue.trim() : undefined,
      email: emailValue && typeof emailValue === 'string' ? emailValue.trim() : undefined,
      primary_phone: phoneValue && typeof phoneValue === 'string' ? phoneValue.trim() : undefined,
      business_id: businessIdValue && typeof businessIdValue === 'string' ? businessIdValue.trim() : undefined,
      tax_identifier: taxIdentifierValue && typeof taxIdentifierValue === 'string' ? taxIdentifierValue.trim() : undefined,
      country: countryValue && typeof countryValue === 'string' ? countryValue.trim().toUpperCase() : undefined,
      first_line_of_address: firstLineValue && typeof firstLineValue === 'string' ? firstLineValue.trim() : undefined,
      city: cityValue && typeof cityValue === 'string' ? cityValue.trim() : undefined,
      region: regionValue && typeof regionValue === 'string' ? regionValue.trim() : undefined,
      zip_code: zipCodeValue && typeof zipCodeValue === 'string' ? zipCodeValue.trim() : undefined,
    }

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key as keyof OrganizationUpdate] === undefined) {
        delete updateData[key as keyof OrganizationUpdate]
      }
    })

    setIsPending(true)

    try {
      const result = await updateOrganization(organization.id, updateData)
      
      if (result.success) {
        toast.success(t("edit.success"))
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || t("edit.error"))
      }
    } catch (error) {
      toast.error(t("edit.error"))
      logger.error("Error updating organization", error instanceof Error ? error : new Error(String(error)))
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

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Business Information Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span>{t("edit.sections.business")}</span>
              </div>

              {/* Business Name */}
              <div className="space-y-2">
                <Label htmlFor="business_name" className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="h-4 w-4" />
                  {t("detail.info.businessName")}
                  <span className="text-xs text-muted-foreground font-normal">
                    ({t("edit.required")})
                  </span>
                </Label>
                <Input
                  id="business_name"
                  name="business_name"
                  defaultValue={organization.business_name || ""}
                  required
                  disabled={isPending}
                  placeholder={t("edit.placeholders.businessName")}
                  className="h-10"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="h-4 w-4" />
                  {t("detail.info.email")}
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={organization.email || ""}
                  disabled={isPending}
                  placeholder={t("edit.placeholders.email")}
                  className="h-10"
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="primary_phone" className="flex items-center gap-2 text-sm font-medium">
                  <Phone className="h-4 w-4" />
                  {t("detail.info.phone")}
                </Label>
                <Input
                  id="primary_phone"
                  name="primary_phone"
                  type="tel"
                  defaultValue={organization.primary_phone || ""}
                  disabled={isPending}
                  placeholder={t("edit.placeholders.phone")}
                  className="h-10"
                />
              </div>

              {/* Business ID & Tax Identifier in grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="business_id" className="text-sm font-medium">
                    {t("detail.info.businessId")}
                  </Label>
                  <Input
                    id="business_id"
                    name="business_id"
                    defaultValue={organization.business_id || ""}
                    disabled={isPending}
                    placeholder={t("edit.placeholders.businessId")}
                    className="h-10"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tax_identifier" className="text-sm font-medium">
                    {t("detail.info.taxId")}
                  </Label>
                  <Input
                    id="tax_identifier"
                    name="tax_identifier"
                    defaultValue={organization.tax_identifier || ""}
                    disabled={isPending}
                    placeholder={t("edit.placeholders.taxId")}
                    className="h-10"
                  />
                </div>
              </div>

              {/* Country */}
              <div className="space-y-2">
                <Label htmlFor="country" className="flex items-center gap-2 text-sm font-medium">
                  <Globe className="h-4 w-4" />
                  {t("detail.info.country")}
                </Label>
                <Input
                  id="country"
                  name="country"
                  defaultValue={organization.country || ""}
                  disabled={isPending}
                  placeholder={t("edit.placeholders.country")}
                  className="h-10 uppercase"
                  maxLength={2}
                />
              </div>
            </div>

            <Separator />

            {/* Address Information Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{t("edit.sections.address")}</span>
              </div>

              {/* Structured address fields */}
              <div className="space-y-4">

                {/* First Line of Address */}
                <div className="space-y-2">
                  <Label htmlFor="first_line_of_address" className="text-sm font-medium">
                    {t("edit.fields.firstLine")}
                  </Label>
                  <Input
                    id="first_line_of_address"
                    name="first_line_of_address"
                    defaultValue={organization.first_line_of_address || ""}
                    disabled={isPending}
                    placeholder={t("edit.placeholders.firstLine")}
                    className="h-10"
                  />
                </div>

                {/* City & Region in grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-sm font-medium">
                      {t("detail.info.city")}
                    </Label>
                    <Input
                      id="city"
                      name="city"
                      defaultValue={organization.city || ""}
                      disabled={isPending}
                      placeholder={t("edit.placeholders.city")}
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="region" className="text-sm font-medium">
                      {t("detail.info.state")}
                    </Label>
                    <Input
                      id="region"
                      name="region"
                      defaultValue={organization.region || ""}
                      disabled={isPending}
                      placeholder={t("edit.placeholders.region")}
                      className="h-10"
                    />
                  </div>
                </div>

                {/* Zip Code */}
                <div className="space-y-2">
                  <Label htmlFor="zip_code" className="text-sm font-medium">
                    {t("detail.info.postalCode")}
                  </Label>
                  <Input
                    id="zip_code"
                    name="zip_code"
                    defaultValue={organization.zip_code || ""}
                    disabled={isPending}
                    placeholder={t("edit.placeholders.zipCode")}
                    className="h-10"
                  />
                </div>
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

