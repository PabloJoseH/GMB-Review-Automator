"use client";

import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

/**
 * RedirectSignInButton Component
 * 
 * Button that redirects to the sign-in page.
 * Used when user tries to access sign-up page while already authenticated.
 * The i18n router automatically handles locale routing.
 */
export function RedirectSignInButton() {
  const router = useRouter();
  const t = useTranslations("auth.signUp");

  const handleGoToSignIn = () => {
    // Use i18n router which automatically handles locale
    // No need to include userId parameter
    router.push("/sign-in");
  };

  return (
    <button
      onClick={handleGoToSignIn}
      className="w-full sm:flex-1 h-11 bg-[var(--active)] text-[var(--active-foreground)] rounded-lg flex items-center justify-center gap-2 font-medium hover:bg-[var(--active)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span>{t("goToSignIn")}</span>
      <ArrowRight className="w-4 h-4" />
    </button>
  );
}

