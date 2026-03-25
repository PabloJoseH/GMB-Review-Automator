import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getAuthenticatedUser, hasUserDatabaseError, checkIfStaff } from "@/lib/auth-helpers";
import { getOnboardingRedirect } from "@/lib/onboarding-helpers";
import { loggers } from "@/lib/logger";
import { getWhatsAppPhoneNumber } from "@/server/actions/supabase/global-config.action";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect_url?: string }>;
};

/**
 * Sign-In Complete Page - OAuth Callback Handler
 * 
 * Handles OAuth callback and redirects users based on type and status:
 * 1. Validates Clerk session and user identity
 * 2. Detects user type (staff → backoffice, customer → onboarding flow)
 * 3. Checks onboarding status and redirects accordingly
 * 4. Handles error states (no session, user not found, unexpected errors)
 * 
 * Dynamic content wrapped in Suspense for progressive loading during auth validation.
 */
export default async function SignInCompletePage({ params, searchParams }: Props) {
  const { locale } = await params;

  return (
    <Card className="w-full shadow-xl">
      <Suspense fallback={<SignInCompleteSkeleton locale={locale} />}>
        <SignInCompleteContent searchParams={searchParams} locale={locale} />
      </Suspense>
    </Card>
  );
}

/**
 * Loading skeleton shown during authentication verification.
 */
async function SignInCompleteSkeleton({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "auth.signInComplete" });

  return (
    <>
      <CardHeader className="space-y-3 text-center">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
        </div>
        <CardTitle className="text-2xl font-bold">{t("checking")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">{t("checkingDescription")}</p>
        </div>
      </CardContent>
    </>
  );
}

/**
 * Handles sign-in completion logic: validates auth, checks user type, handles redirects.
 * Returns CardHeader and CardContent based on authentication state.
 * 
 * Flow: auth() → checkIfStaff() → getAuthenticatedUser() → getOnboardingRedirect() → redirect
 */
async function SignInCompleteContent({ searchParams, locale }: { searchParams: Props['searchParams']; locale: string }) {
  const { redirect_url: redirectParam } = await searchParams;
  const t = await getTranslations({ locale, namespace: "auth.signInComplete" });

  // Get WhatsApp phone number from global config
  const whatsappResult = await getWhatsAppPhoneNumber();
  const whatsappNumber = whatsappResult.success && whatsappResult.data ? whatsappResult.data : null;
  const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : 'https://wa.me/';

  try {
    // First, get Clerk session info
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      loggers.signin.error('No Clerk session found', null, { locale });
      
      return (
        <>
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto w-16 h-16 bg-destructive/10 dark:bg-destructive/20 rounded-full flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-8 h-8 text-destructive"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <CardTitle className="text-2xl font-bold text-destructive">
              {t("authFailed")}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 dark:bg-destructive/20 p-4">
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
                    {t("authFailedDescription")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("authFailedHelp")}
                  </p>
                </div>
              </div>
            </div>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-12 bg-[var(--active)] hover:bg-[var(--active)]/90 text-[var(--active-foreground)] rounded-lg flex items-center justify-center space-x-3 transition-colors font-medium"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
              <span>{t("returnToWhatsApp")}</span>
            </a>
          </CardContent>
        </>
      );
    }

    const isStaff = await checkIfStaff(clerkUserId);
    
    if (isStaff) {
      loggers.signin.info('Staff user detected, redirecting to backoffice', {
        clerkId: clerkUserId,
        locale
      });
      redirect({ href: '/backoffice', locale });
    }
    
    const authResult = await getAuthenticatedUser(locale);
    const { dbUser } = authResult;
    const hasUserError = hasUserDatabaseError(authResult);
    
    if (hasUserError) {
      loggers.signin.error('User not found in database during sign-in', null, {
        clerkId: clerkUserId,
        locale
      });
      
      return (
        <>
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto w-16 h-16 bg-destructive/10 dark:bg-destructive/20 rounded-full flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-8 h-8 text-destructive"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <CardTitle className="text-2xl font-bold text-destructive">
              {t("userNotFound")}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 dark:bg-destructive/20 p-4">
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
                    {t("userNotFoundDescription")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("userNotFoundHelp")}
                  </p>
                </div>
              </div>
            </div>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-12 bg-[var(--active)] hover:bg-[var(--active)]/90 text-[var(--active-foreground)] rounded-lg flex items-center justify-center space-x-3 transition-colors font-medium"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
              <span>{t("returnToWhatsApp")}</span>
            </a>

            <p className="text-xs text-center text-muted-foreground">
              {t("continueInWhatsApp")}
            </p>
          </CardContent>
        </>
      );
    }
    
    const redirectPath = getOnboardingRedirect(
      dbUser.onboarding_status,
      !!dbUser.organization_id,
      locale,
      'complete'
    );
    
    if (redirectPath) {
      loggers.signin.info('Redirecting customer based on onboarding status', {
        userId: dbUser.id,
        onboardingStatus: dbUser.onboarding_status,
        redirectPath,
        locale
      });
      const pathWithoutLocale = redirectPath.replace(/^\/[a-z]{2}\//, '/');
      redirect({ href: pathWithoutLocale, locale });
    }
    
    if (redirectParam && 
        dbUser.onboarding_status === 'done' && 
        dbUser.organization_id &&
        redirectParam.includes('/proposed-responses')) {
      
      const pathWithoutLocale = redirectParam.replace(/^\/[a-z]{2}\//, '/');
      
      loggers.signin.info('Redirecting customer to proposed-responses', {
        userId: dbUser.id,
        redirectParam,
        pathWithoutLocale,
        locale
      });
      
      redirect({ href: pathWithoutLocale, locale });
    }
    
    loggers.signin.success('Sign-in flow completed successfully', {
      userId: dbUser.id,
      clerkId: clerkUserId,
      locale
    });

    return (
      <>
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-16 h-16 bg-[var(--active)]/20 rounded-full flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-8 h-8 text-[var(--active)]"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold text-[var(--active)]">
            {t("title")}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">
              {t("greeting", { name: dbUser.name || t("user") })}
            </p>
            <p className="text-muted-foreground">
              {t("description")}
            </p>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-12 bg-[var(--active)] hover:bg-[var(--active)]/90 text-[var(--active-foreground)] rounded-lg flex items-center justify-center space-x-3 transition-colors font-medium"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            <span>{t("returnToWhatsApp")}</span>
          </a>

          <p className="text-xs text-center text-muted-foreground">
            {t("continueInWhatsApp")}
          </p>
        </CardContent>
      </>
    );

  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error && 
        typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    
    loggers.signin.error('Unexpected error during sign-in completion', error, { locale });
    return (
      <>
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 dark:bg-destructive/20 rounded-full flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-8 h-8 text-destructive"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold text-destructive">
            {t("errorTitle")}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 dark:bg-destructive/20 p-4">
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
                  {t("unexpectedError")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("unexpectedErrorDescription")}
                </p>
              </div>
            </div>
          </div>

          <Link
            href={`/${locale}/sign-in`}
            className="w-full h-12 bg-[var(--active)] hover:bg-[var(--active)]/90 text-[var(--active-foreground)] rounded-lg flex items-center justify-center transition-colors font-medium"
          >
            {t("tryAgain")}
          </Link>
        </CardContent>
      </>
    );
  }
}
