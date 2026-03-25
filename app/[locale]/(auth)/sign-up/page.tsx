import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GoogleSignUpButton } from "@/components/auth/GoogleSignUpButton";
import { RedirectSignInButton } from "@/components/auth/RedirectSignInButton";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { Link } from "@/i18n/navigation";
import { validateAuthParams } from "@/server/actions/supabase/users.action";
import { loggers } from "@/lib/logger";
import { AlertTriangle } from "lucide-react";
import { APP_CONSTANTS } from "@/lib/constants";
import Image from "next/image";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ u?: string; error?: string; message?: string; reauth?: string }>;
};

/**
 * Sign Up Page
 * 
 * WhatsApp Integration Flow:
 * 1. User arrives from WhatsApp with REQUIRED userId parameter (?u=userId)
 * 2. Server validates the parameter (shows error if missing/invalid)
 * 3. Displays Google OAuth button or disabled state based on validation
 * 4. After authentication, redirects to onboarding with preserved userId
 * 
 * Validates auth parameters, handles reauth flow, and renders Clerk captcha.
 * Dynamic content wrapped in Suspense for progressive loading.
 * 
 * URL Structure: /[locale]/sign-up?u=[userId]&error=[type]&message=[text]&reauth=[true]
 */
export default async function SignUpPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.signUp" });
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
          <Suspense fallback={<SignUpContentSkeleton />}>
            <SignUpContent searchParams={searchParams} locale={locale} />
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

          <div 
            id="clerk-captcha" 
            data-cl-theme="auto"
            data-cl-size="compact"
          />
        </CardContent>
      </Card>

      <div className="mt-6 text-center text-sm">
        <span className="text-muted-foreground">{t("hasAccount")} </span>
        <Link 
          href="/sign-in" 
          className="font-semibold text-[var(--active)] hover:underline"
        >
          {t("signInLink")}
        </Link>
      </div>
    </>
  );
}

/**
 * Skeleton for sign-up content while loading
 */
function SignUpContentSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

/**
 * Handles dynamic sign-up content: parameter validation, error messages, and OAuth button.
 * Validates userId via validateAuthParams, handles reauth flow, and conditionally renders buttons.
 */
async function SignUpContent({ searchParams, locale }: { searchParams: Props['searchParams']; locale: string }) {
  const { u: userId, error, message, reauth } = await searchParams;
  const t = await getTranslations({ locale, namespace: "auth.signUp" });
  const tErrors = await getTranslations({ locale, namespace: "auth.errors" });

  // Server-side validation of auth parameters
  // userId is REQUIRED - show error on page if missing or invalid
  // Also checks if the user exists in the database before allowing sign-up
  const validation = await validateAuthParams(locale, userId);

  // Scenario: Reauth flow with authenticated user
  const isReauthFlow = reauth === 'true' && validation.error === 'user_is_authenticated';

  if (!validation.isValid) {
    // Don't log as error if this is the expected reauth flow
    if (isReauthFlow) {
      loggers.signup.info("Reauth flow detected - user is authenticated", {
        locale,
        userId: userId || 'undefined',
        reauth: true,
      });
    } else {
      loggers.signup.error(validation.message || "Invalid or missing registration parameters", null, {
        error: validation.error,
        locale,
        userId: userId || 'undefined',
      });
    }
  } else {
    loggers.signup.info("Sign-up page loaded", {
      locale,
      userId: validation.userId,
    });
  }

  // Build redirect URL (only used if validation passed or reauth flow)
  const redirectUrl = (validation.userId || (reauth === 'true' && userId))
    ? `/${locale}/onboarding?u=${encodeURIComponent(validation.userId || userId || '')}${reauth ? '&reauth=true' : ''}`
    : '';

  const shouldEnableButton = validation.isValid || isReauthFlow;

  return (
    <>
      {isReauthFlow && (
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-orange-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                {t("reauthWarning.title")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("reauthWarning.description", { companyName: APP_CONSTANTS.brand.companyName })}
              </p>
            </div>
          </div>
        </div>
      )}

      {!validation.isValid && validation.error && !isReauthFlow && (
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
                {tErrors(validation.error)}
              </p>
              {validation.message && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {validation.message}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {error && message && (
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
              <p className="text-sm font-medium text-destructive">{t("error")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {decodeURIComponent(message)}
              </p>
            </div>
          </div>
        </div>
      )}

      {shouldEnableButton ? (
        <GoogleSignUpButton redirectUrl={redirectUrl} locale={locale} reauth={isReauthFlow ? true : undefined} />
      ) : (
        <div className="flex flex-col gap-3">
          {validation.error === 'user_is_authenticated' && !isReauthFlow && (
            <div className="flex flex-col sm:flex-row gap-3">
              <SignOutButton locale={locale} userId={userId} />
              <RedirectSignInButton />
            </div>
          )}
          
          <button
            disabled
            className="w-full h-12 bg-muted border border-border rounded-lg flex items-center justify-center space-x-3 cursor-not-allowed opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path
                d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                fill="#4285F4"
              />
              <path
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                fill="#34A853"
              />
              <path
                d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                fill="#EA4335"
              />
            </svg>
            <span className="text-muted-foreground font-medium">{t("button")}</span>
          </button>
        </div>
      )}
    </>
  );
}

