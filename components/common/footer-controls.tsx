"use client";

import { ModeToggle } from "@/components/common/mode-toggle";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { useTranslations } from "next-intl";
import { APP_CONSTANTS } from "@/lib/constants";

/**
 * Footer Controls Component
 * Displays language switcher and theme toggle for auth and onboarding pages
 * Includes copyright notice at the bottom
 */
export function FooterControls({ currentYear }: { currentYear?: number }) {
  const t = useTranslations("common.footer");
  const year = currentYear ?? new Date().getFullYear();

  return (
    <div className="w-full mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 pt-8 pb-3 md:pt-12 md:pb-4">
          {/* Separator */}
          <div className="border-t border-border/40 w-full" />
          
          {/* Desktop: Copyright left, Controls right */}
          {/* Mobile: Controls first, then Copyright */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 w-full">
            {/* Controls - First on mobile, right on desktop */}
            <div className="flex flex-row items-center justify-center md:justify-end gap-4 order-1 md:order-2">
              <ModeToggle />
              <LanguageSwitcher />
            </div>
            
            {/* Copyright - Second on mobile, left on desktop */}
            <div className="text-center md:text-left text-xs text-muted-foreground order-2 md:order-1">
              © {year} {APP_CONSTANTS.brand.companyName}. {t("rights")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

