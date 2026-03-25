/**
 * User Not Found Banner Component
 * 
 * Displays an error banner when a user is not found in the database.
 * This component uses the same styling as the sign-up page validation errors.
 * 
 * Usage:
 * - Show when user authentication succeeds but database record is missing
 * - Consistent styling across auth/onboarding flows
 * 
 * @example
 * // In a server component:
 * const t = await getTranslations("auth.signUp");
 * <UserNotFoundBanner 
 *   title={t("userNotFound")} 
 *   description={t("userNotFoundDescription")} 
 * />
 */

'use client'

import { useTranslations } from "next-intl";

interface ErrorBannerProps {
  error_banner_name?: string;
}

export function ErrorBanner({ error_banner_name }: ErrorBannerProps) {
  const t = useTranslations("onboarding.errorBanner." + error_banner_name);
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
      <div className="flex items-start gap-3">
        <svg
          className="h-5 w-5 flex-shrink-0 text-destructive"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-destructive">
            {t("title")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
      </div>
    </div>
  )
}

