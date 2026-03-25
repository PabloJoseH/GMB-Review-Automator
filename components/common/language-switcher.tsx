"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Language Switcher Component
 * 
 * Displays current language and allows switching between English and Spanish.
 * Uses next-intl's navigation APIs for proper App Router integration.
 * Preserves all URL search parameters when changing locale.
 * 
 * Implementation follows official next-intl v4 recommendations.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common.language");
  const pathname = usePathname(); // Returns pathname WITHOUT locale prefix
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleLanguageChange = () => {
    const nextLocale = locale === "en" ? "es" : "en";
    
    startTransition(() => {
      // Convert URLSearchParams to object for next-intl router
      const query: Record<string, string> = {};
      searchParams.forEach((value, key) => {
        query[key] = value;
      });

      // Navigate to same pathname with new locale, preserving all search params
      // next-intl router handles both cases (with/without query) seamlessly
      const href = Object.keys(query).length > 0
        ? { pathname, query }
        : pathname;

      router.replace(href, { locale: nextLocale });
    });
  };

  const languages = {
    en: t("en"),
    es: t("es"),
  };

  return (
    <button
      onClick={handleLanguageChange}
      disabled={isPending}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-muted/50 px-3 text-sm font-medium transition-all hover:bg-muted disabled:opacity-50"
      aria-label={t("switch")}
      title={t("switch")}
    >
      <Languages className="h-4 w-4" />
      <span>{languages[locale as keyof typeof languages]}</span>
      <span className="sr-only">
        {t("switch")}
      </span>
    </button>
  );
}
