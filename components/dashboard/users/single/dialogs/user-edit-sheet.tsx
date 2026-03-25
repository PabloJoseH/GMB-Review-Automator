"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { User, Mail, UserCircle, Shield, Phone, CheckCircle } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateUser } from "@/server/actions/supabase/users.action"
import type { UserWithOrganization } from "@/lib/prisma-types"
import type { users } from "@/app/generated/prisma"
import { createLogger } from "@/lib/logger"

const logger = createLogger('USER-EDIT')

/**
 * UserEditSheet Component
 * 
 * Features:
 * - Sheet modal for editing user information
 * - Automatic revalidation on success via router.refresh()
 * - Toast notifications for success/error
 * - Fully internationalized
 * 
 * Design:
 * - Clean hierarchy with visual sections
 * - Icons for better UX and visual guidance
 * - Proper spacing and padding following design system
 * - Grouped related fields (personal info vs system info)
 * - Responsive layout with proper padding (SheetHeader p-4, content px-4)
 */

interface UserEditSheetProps {
  user: Pick<UserWithOrganization, "id" | "name" | "lastname" | "email" | "username" | "role" | "onboarding_status" | "wa_id">
  children: React.ReactNode
}

type UserUpdate = Partial<{
  name: string | null
  lastname: string | null
  email: string | null
  username: string
  role: users['role']
  wa_id: string
  onboarding_status: users['onboarding_status']
}>

export function UserEditSheet({ user, children }: UserEditSheetProps) {
  const t = useTranslations("backoffice.users")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [role, setRole] = useState<users['role']>(user.role || 'USER')
  const [onboardingStatus, setOnboardingStatus] = useState<users['onboarding_status']>(user.onboarding_status || 'user')

  useEffect(() => {
    if (open) {
      setRole(user.role || 'USER')
      setOnboardingStatus(user.onboarding_status || 'user')
    }
  }, [open, user.role, user.onboarding_status])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const formData = new FormData(e.currentTarget)
    const nameValue = formData.get("name")
    const lastnameValue = formData.get("lastname")
    const emailValue = formData.get("email")
    const usernameValue = formData.get("username")
    const waIdValue = formData.get("wa_id")

    const updateData: UserUpdate = {
      name: nameValue && typeof nameValue === 'string' ? nameValue.trim() || null : null,
      lastname: lastnameValue && typeof lastnameValue === 'string' ? lastnameValue.trim() || null : null,
      email: emailValue && typeof emailValue === 'string' ? emailValue.trim() || null : null,
      username: usernameValue && typeof usernameValue === 'string' ? usernameValue.trim() : user.username,
      role: role,
      wa_id: waIdValue && typeof waIdValue === 'string' ? waIdValue.trim() : user.wa_id,
      onboarding_status: onboardingStatus,
    }

    setIsPending(true)

    try {
      const result = await updateUser(user.id, updateData)
      
      if (result.success) {
        toast.success(t("edit.success"))
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || t("edit.error"))
      }
    } catch (error) {
      toast.error(t("edit.error"))
      logger.error("Error updating user", error instanceof Error ? error : new Error(String(error)))
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
        {/* Header - Already has p-4 padding from SheetHeader */}
        <SheetHeader>
          <SheetTitle className="text-2xl font-semibold tracking-tight">
            {t("edit.title")}
          </SheetTitle>
          <SheetDescription className="text-base">
            {t("edit.description")}
          </SheetDescription>
        </SheetHeader>

        {/* Content with proper padding px-4 to match SheetHeader */}
        <div className="px-4 pb-4">
          <Separator className="mb-6" />

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Personal Information Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <User className="h-4 w-4" />
                <span>{t("edit.sections.personal")}</span>
              </div>

              {/* Name & Lastname in grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">
                    {t("detail.info.name")}
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={user.name || ""}
                    disabled={isPending}
                    placeholder={t("edit.placeholders.name")}
                    className="h-10"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastname" className="text-sm font-medium">
                    {t("detail.info.lastname")}
                  </Label>
                  <Input
                    id="lastname"
                    name="lastname"
                    defaultValue={user.lastname || ""}
                    disabled={isPending}
                    placeholder={t("edit.placeholders.lastname")}
                    className="h-10"
                  />
                </div>
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
                  defaultValue={user.email || ""}
                  disabled={isPending}
                  placeholder={t("edit.placeholders.email")}
                  className="h-10"
                />
              </div>

              {/* WhatsApp ID */}
              <div className="space-y-2">
                <Label htmlFor="wa_id" className="flex items-center gap-2 text-sm font-medium">
                  <Phone className="h-4 w-4" />
                  {t("detail.info.waId")}
                  <span className="text-xs text-muted-foreground font-normal">
                    ({t("edit.required")})
                  </span>
                </Label>
                <Input
                  id="wa_id"
                  name="wa_id"
                  type="text"
                  defaultValue={user.wa_id}
                  required
                  disabled={isPending}
                  placeholder={t("edit.placeholders.waId")}
                  className="h-10 font-mono text-sm"
                />
              </div>
            </div>

            <Separator />

            {/* System Information Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Shield className="h-4 w-4" />
                <span>{t("edit.sections.system")}</span>
              </div>

              {/* Username */}
              <div className="space-y-2">
                <Label htmlFor="username" className="flex items-center gap-2 text-sm font-medium">
                  <UserCircle className="h-4 w-4" />
                  {t("detail.info.username")}
                  <span className="text-xs text-muted-foreground font-normal">
                    ({t("edit.required")})
                  </span>
                </Label>
                <Input
                  id="username"
                  name="username"
                  defaultValue={user.username}
                  required
                  disabled={isPending}
                  placeholder={t("edit.placeholders.username")}
                  className="h-10 font-mono text-sm"
                />
              </div>

              {/* Role */}
              <div className="space-y-2">
                <Label htmlFor="role" className="text-sm font-medium">
                  {t("detail.info.role")}
                </Label>
                <Select value={role} onValueChange={(value) => setRole(value as users['role'])} disabled={isPending}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">{t("roles.USER")}</SelectItem>
                    <SelectItem value="CLIENT">{t("roles.CLIENT")}</SelectItem>
                    <SelectItem value="VISUALIZER">{t("roles.VISUALIZER")}</SelectItem>
                    <SelectItem value="OWNER">{t("roles.OWNER")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Onboarding Status */}
              <div className="space-y-2">
                <Label htmlFor="onboarding_status" className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle className="h-4 w-4" />
                  {t("detail.info.onboardingStatus")}
                </Label>
                <Select value={onboardingStatus} onValueChange={(value) => setOnboardingStatus(value as users['onboarding_status'])} disabled={isPending}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">{t("onboardingStatus.user")}</SelectItem>
                    <SelectItem value="client">{t("onboardingStatus.client")}</SelectItem>
                    <SelectItem value="onOrganizationPage">{t("onboardingStatus.onOrganizationPage")}</SelectItem>
                    <SelectItem value="onLocationPage">{t("onboardingStatus.onLocationPage")}</SelectItem>
                    <SelectItem value="onLocalizationPage">{t("onboardingStatus.onLocalizationPage")}</SelectItem>
                    <SelectItem value="onPaymentPage">{t("onboardingStatus.onPaymentPage")}</SelectItem>
                    <SelectItem value="done">{t("onboardingStatus.done")}</SelectItem>
                  </SelectContent>
                </Select>
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
