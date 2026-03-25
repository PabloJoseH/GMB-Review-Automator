"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { User, Phone, UserPlus } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import type { users } from "@/app/generated/prisma"
import { createUser } from "@/server/actions/supabase/users.action"
import { createLogger } from "@/lib/logger"

/**
 * @fileoverview Client-only sheet that renders the backoffice create user form and
 * triggers the Supabase `createUser` server action.
 * 
 * @remarks
 * Exports:
 * - `CreateUserSheet`: Wraps any trigger element and shows a form to register a new user.
 * Behavior:
 * - Derives the username from the provided name + lastname pair.
 * - Forces the `USER` role and default onboarding status while omitting email, role, and onboarding controls.
 */

const DEFAULT_ROLE: users["role"] = "USER"
const DEFAULT_ONBOARDING_STATUS: users["onboarding_status"] = "user"
const logger = createLogger("USER-CREATE")

interface CreateUserSheetProps {
  children: React.ReactNode
}

function getOptionalValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null
  }
  const trimmedValue = value.trim()
  return trimmedValue.length ? trimmedValue : null
}

function getRequiredValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * @description Normalize a text value into an alphanumeric string suitable for username generation.
 */
function normalizeUsernameSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
}

/**
 * @description Compose a username concatenating the primary name and optional lastname.
 */
function buildUsername(name: string, lastname?: string | null) {
  const combined = `${name}${lastname ?? ""}`
  const sanitized = normalizeUsernameSegment(combined)
  if (sanitized.length) {
    return sanitized.toLowerCase()
  }

  const fallback = normalizeUsernameSegment(name)
  if (fallback.length) {
    return fallback.toLowerCase()
  }

  return name.replace(/\s+/g, "").toLowerCase() || combined.toLowerCase()
}

export function CreateUserSheet({ children }: CreateUserSheetProps) {
  const t = useTranslations("backoffice.users")
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const resetForm = () => {
    formRef.current?.reset()
  }

  const handleOpenChange = (value: boolean) => {
    setOpen(value)
    if (!value) {
      resetForm()
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const nameValue = getRequiredValue(formData.get("name"))
    const lastnameValue = getOptionalValue(formData.get("lastname"))
    const waId = getRequiredValue(formData.get("wa_id"))

    if (!nameValue || !waId) {
      toast.error(t("create.error"))
      return
    }

    const payload = {
      username: buildUsername(nameValue, lastnameValue),
      wa_id: waId,
      role: DEFAULT_ROLE,
      onboarding_status: DEFAULT_ONBOARDING_STATUS,
      name: nameValue,
      lastname: lastnameValue,
    }

    setIsPending(true)

    try {
      const result = await createUser(payload)

      if (result.success) {
        toast.success(t("create.success"))
        resetForm()
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || t("create.error"))
      }
    } catch (error) {
      toast.error(t("create.error"))
      logger.error("Failed to create user", error instanceof Error ? error : new Error(String(error)))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <UserPlus className="h-5 w-5 text-[var(--active)]" />
            {t("create.title")}
          </SheetTitle>
          <SheetDescription className="text-base">
            {t("create.description")}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          <Separator className="mb-6" />

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <User className="h-4 w-4" />
                <span>{t("create.sections.profile")}</span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="flex items-center justify-between text-sm font-medium">
                    <span>{t("detail.info.name")}</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      ({t("edit.required")})
                    </span>
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    disabled={isPending}
                    placeholder={t("create.placeholders.name")}
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
                    disabled={isPending}
                    placeholder={t("create.placeholders.lastname")}
                    className="h-10"
                  />
                </div>
              </div>

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
                  required
                  disabled={isPending}
                  placeholder={t("create.placeholders.waId")}
                  className="h-10 font-mono text-sm"
                />
              </div>
            </div>

            <Separator />

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
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
                {isPending ? t("create.submitting") : t("create.submit")}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}

