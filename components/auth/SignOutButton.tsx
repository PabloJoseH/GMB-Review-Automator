"use client";

import { useClerk } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { loggers } from "@/lib/logger";

interface SignOutButtonProps {
  locale: string;
  userId?: string;
}

/**
 * SignOutButton Component
 * 
 * Button that signs out from Clerk and refreshes the current route.
 * Used when user tries to access sign-up page while already authenticated.
 */
export function SignOutButton({ locale, userId }: SignOutButtonProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { signOut } = useClerk();
  const t = useTranslations("auth.signUp");

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      loggers.signup.info("Signing out authenticated user", { locale, userId });

      // Sign out and redirect to current page (preserving userId parameter)
      const currentUrl = window.location.href;
      // Keep the userId parameter in the URL
      const redirectUrl = currentUrl;

      await signOut({ redirectUrl });
      
      // Note: Clerk will handle the redirect automatically
      // If redirect doesn't work, the page will refresh naturally
    } catch (error) {
      loggers.signup.error("Error signing out", error);
      setIsSigningOut(false);
      
      // Fallback: refresh the page manually, preserving the userId parameter
      window.location.href = window.location.href;
    }
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={isSigningOut}
      className="w-full sm:flex-1 h-11 bg-muted border border-border text-foreground rounded-lg flex items-center justify-center gap-2 font-medium hover:bg-muted/80 dark:hover:bg-muted/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isSigningOut ? (
        <>
          <div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
          <span>{t("signOut")}...</span>
        </>
      ) : (
        <>
          <LogOut className="w-4 h-4" />
          <span>{t("signOut")}</span>
        </>
      )}
    </button>
  );
}

