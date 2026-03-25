"use client";

import { useSignIn, useClerk } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { loggers } from "@/lib/logger";

interface GoogleSignInButtonProps {
  redirectUrl: string;
  locale: string;
}

/**
 * GoogleSignInButton Component
 * 
 * OAuth authentication button for existing users to re-authenticate through Google.
 * This component is specifically designed for sign-in scenarios where users need to:
 * 
 * 1. Revalidate expired OAuth tokens (Google My Business API access)
 * 2. Update their WhatsApp number after changing phones
 * 3. Re-authenticate after extended inactivity (30+ days)
 * 
 * Flow:
 * - If an active Clerk session exists, signs out first to ensure fresh OAuth consent
 * - Initiates Google OAuth flow via Clerk's authenticateWithRedirect
 * - Upon successful authentication, redirects to the specified redirectUrl
 * - The complete page handles session validation and onboarding status checks
 * 
 * Technical notes:
 * - Uses Clerk's useSignIn() hook for OAuth authentication
 * - Handles session cleanup to avoid "already signed in" errors
 * - Automatically reloads page after sign-out to maintain clean state
 * 
 * @param redirectUrl - URL to redirect after successful OAuth (typically /sign-in/complete)
 * @param locale - Current application locale for localized redirects
 */
export function GoogleSignInButton({ redirectUrl, locale }: GoogleSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, isLoaded } = useSignIn();
  const { signOut, session } = useClerk();
  const t = useTranslations("auth.signIn");

  const handleGoogleSignIn = async () => {
    // Wait for Clerk to initialize
    if (!isLoaded || !signIn) {
      loggers.signin.error("Clerk SDK not loaded", null, { isLoaded, hasSignIn: !!signIn });
      return;
    }

    try {
      setIsLoading(true);
      
      // Check for existing session - must sign out first for fresh OAuth
      if (session) {
        loggers.signin.info("Existing session detected, initiating sign-out for fresh OAuth", { 
          sessionId: session.id,
          userId: session.user?.id 
        });
        
        // Sign out with redirect back to current page
        // User will need to click the button again after page reload
        const currentUrl = window.location.href;
        await signOut({ redirectUrl: currentUrl });
      }
      
      loggers.signin.info("Initiating Google OAuth sign-in", { locale });

      // Start OAuth flow - Clerk handles popup/redirect and session creation
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: redirectUrl,
        redirectUrlComplete: redirectUrl,
      });
      
      // Note: Code after this won't execute as browser redirects to Google
    } catch (error) {
      loggers.signin.error("OAuth authentication failed", error);
      setIsLoading(false);
      
      // Show user-friendly error
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      alert(`Error connecting to Google: ${errorMessage}\n\nPlease try again.`);
    }
  };

  return (
    <button
      onClick={handleGoogleSignIn}
      disabled={isLoading || !isLoaded}
      className="w-full h-12 bg-white dark:bg-secondary border border-border rounded-lg flex items-center justify-center space-x-3 hover:bg-gray-50 dark:hover:bg-secondary/80 active:bg-gray-100 dark:active:bg-secondary/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
    >
      {isLoading ? (
        <div className="w-5 h-5 border-2 border-border border-t-[var(--active)] rounded-full animate-spin" />
      ) : (
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
      )}
      <span className="text-gray-700 dark:text-foreground font-medium">{isLoading ? t("buttonLoading") : t("button")}</span>
    </button>
  );
}

