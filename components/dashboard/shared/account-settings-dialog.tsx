"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { useLocale } from "next-intl"
import { useRouter, usePathname } from "@/i18n/navigation"
import { useTransition } from "react"
import { Monitor, Moon, Sun, Languages, Settings as SettingsIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

interface AccountSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Account Settings Dialog Component
 * 
 * Modal for managing user preferences:
 * - Theme selection (light, dark, system)
 * - Language selection (English, Spanish)
 * 
 * Uses next-themes for theme management and next-intl for internationalization.
 */
export function AccountSettingsDialog({ open, onOpenChange }: AccountSettingsDialogProps) {
  const t = useTranslations("backoffice.accountSettings")
  const { theme, setTheme } = useTheme()
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch for theme
  useState(() => {
    setMounted(true)
  })

  const handleLanguageChange = (newLocale: string) => {
    startTransition(() => {
      router.replace(pathname, { locale: newLocale })
      onOpenChange(false)
    })
  }

  const themeOptions = [
    { value: "light", icon: Sun, label: t("theme.light") },
    { value: "dark", icon: Moon, label: t("theme.dark") },
    { value: "system", icon: Monitor, label: t("theme.system") },
  ] as const

  const languageOptions = [
    { value: "en", label: t("language.en"), flag: "🇬🇧" },
    { value: "es", label: t("language.es"), flag: "🇪🇸" },
  ] as const

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="rounded-lg bg-primary/10 p-2">
              <SettingsIcon className="h-5 w-5 text-primary" />
            </div>
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Theme Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              {mounted && theme === "light" && <Sun className="h-4 w-4" />}
              {mounted && theme === "dark" && <Moon className="h-4 w-4" />}
              {mounted && theme === "system" && <Monitor className="h-4 w-4" />}
              {!mounted && <Monitor className="h-4 w-4" />}
              {t("theme.title")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("theme.description")}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map(({ value, icon: Icon, label }) => {
                const isActive = mounted && theme === value
                return (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={`
                      flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all
                      ${
                        isActive
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      }
                    `}
                    aria-label={label}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                      {label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Language Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Languages className="h-4 w-4" />
              {t("language.title")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("language.description")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {languageOptions.map(({ value, label, flag }) => {
                const isActive = locale === value
                return (
                  <button
                    key={value}
                    onClick={() => handleLanguageChange(value)}
                    disabled={isPending}
                    className={`
                      flex items-center justify-center gap-2 rounded-lg border-2 p-4 transition-all
                      ${
                        isActive
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      }
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                    aria-label={label}
                  >
                    <span className="text-2xl">{flag}</span>
                    <span className={`text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                      {label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

