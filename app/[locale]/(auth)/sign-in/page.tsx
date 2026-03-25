import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { Link } from "@/i18n/navigation";
import { APP_CONSTANTS } from "@/lib/constants";
import Image from "next/image";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; redirect_url?: string; u?: string }>;
};

/**
 * Sign-In Page - Unified Authentication Entry Point
 * 
 * Handles authentication for:
 * - Existing customers re-authenticating via WhatsApp
 * - Staff members accessing backoffice
 * - Users revalidating Google OAuth tokens
 * 
 * Reads searchParams for error handling and renders OAuth button.
 * Dynamic content (errors, button) wrapped in Suspense for progressive loading.
 */
export default async function SignInPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.signIn" });
  const tCommon = await getTranslations({ locale, namespace: "common" });

  return (
    <>
      <Card className="shadow-xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-16 h-16 bg-[var(--active)] rounded-2xl flex items-center justify-center">
            <Image
              src={APP_CONSTANTS.brand.logoUrl}
              alt={APP_CONSTANTS.brand.companyName}
              width={32}
              height={32}
              className="w-8 h-8"
            />
          </div>
          <CardTitle className="text-2xl font-bold">{t("title")}</CardTitle>
          <CardDescription className="text-base">{t("description")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Suspense fallback={<SignInContentSkeleton />}>
            <SignInContent searchParams={searchParams} locale={locale} />
          </Suspense>

          <p className="text-xs text-center text-muted-foreground">
            {tCommon("termsAcceptanceBefore")}{" "}
            
            <br className="inline md:hidden" />
            <Link href="/terms" className="underline hover:text-[var(--active)] transition-colors">
              {tCommon("terms")}
            </Link>{" "}
            {tCommon("termsAcceptanceAnd")}{" "}
            <Link href="/privacy" className="underline hover:text-[var(--active)] transition-colors">
              {tCommon("privacy")}
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <div className="mt-6 text-center text-sm">
        <span className="text-muted-foreground">{t("noAccount")} </span>
        <Link 
          href="/sign-up" 
          className="font-semibold text-[var(--active)] hover:underline"
        >
          {t("signUpLink")}
        </Link>
      </div>
    </>
  );
}

/**
 * Skeleton for sign-in content while loading
 */
function SignInContentSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

/**
 * Handles dynamic sign-in content: error messages and OAuth button.
 * Reads searchParams for error states (userAlreadyExists, accountAlreadyConnected, accountMismatch).
 */
async function SignInContent({ searchParams, locale }: { searchParams: Props['searchParams']; locale: string }) {
  const { error, redirect_url } = await searchParams;
  const t = await getTranslations({ locale, namespace: "auth.signIn" });

  const completeUrl = redirect_url
    ? `/${locale}/sign-in/complete?redirect_url=${encodeURIComponent(redirect_url)}`
    : `/${locale}/sign-in/complete`;

  return (
    <>
      {error === "userAlreadyExists" && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 shrink-0 text-destructive"
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
                {t("userAlreadyExists")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("userAlreadyExistsDescription")}
              </p>
            </div>
          </div>
        </div>
      )}

      {error === "accountAlreadyConnected" && (
        <div className="rounded-lg border border-orange-500/50 bg-orange-500/10 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 shrink-0 text-orange-500"
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
              <p className="text-sm font-medium text-orange-500">
                {t("accountAlreadyConnected")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("accountAlreadyConnectedDescription")}
              </p>
            </div>
          </div>
        </div>
      )}

      {error === "accountMismatch" && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 shrink-0 text-destructive"
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
                {t("accountMismatch")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("accountMismatchDescription")}
              </p>
            </div>
          </div>
        </div>
      )}

      <GoogleSignInButton redirectUrl={completeUrl} locale={locale} />
    </>
  );
}