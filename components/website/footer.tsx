"use client";

import { Suspense } from "react";
import { MessageCircle, Mail } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ModeToggle } from "@/components/common/mode-toggle";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { APP_CONSTANTS } from "@/lib/constants";

/**
 * Footer Component
 * Site footer with Numa Labs branding, legal links, contact info, and utility controls.
 */
export function Footer({ currentYear }: { currentYear?: number }) {
  const t = useTranslations("website.footer");
  const year = currentYear ?? new Date().getFullYear();

  return (
    <footer className="w-full border-t border-border/40 bg-linear-to-b from-background to-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand Info */}
          <div className="space-y-4 sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-emerald-600 shadow-md">
                <MessageCircle className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold">{APP_CONSTANTS.brand.companyName}</span>
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground">{t("tagline")}</p>
            <p className="text-xs font-medium text-primary/60">{t("companyInfo")}</p>
          </div>

          {/* Legal Links */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/80">
              {t("legal")}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {t("terms")}
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {t("privacy")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/80">
              {t("contact")}
            </h3>
            <ul className="space-y-2.5">
              <li className="flex items-center gap-2">
                <Image src="/whatsapp.svg" alt="WhatsApp" width={16} height={16} className="opacity-60" />
                <span className="text-sm text-muted-foreground">{t("whatsapp")}</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground/60" />
                <a
                  href={`mailto:${APP_CONSTANTS.brand.email}`}
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {APP_CONSTANTS.brand.email}
                </a>
              </li>
            </ul>
          </div>

          {/* Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/80">
              {t("settings")}
            </h3>
            <div className="flex flex-col gap-3">
              <ModeToggle />
              <Suspense fallback={<div className="h-10 w-24 animate-pulse rounded-full bg-muted" />}>
                <LanguageSwitcher />
              </Suspense>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-12 border-t border-border/40 pt-8 text-center text-xs text-muted-foreground">
          © {year} {APP_CONSTANTS.brand.parentCompany}. {t("rights")}
        </div>
      </div>
    </footer>
  );
}
