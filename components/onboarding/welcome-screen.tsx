/**
 * Welcome screen component for onboarding entry.
 * 
 * This component renders the onboarding introduction with key benefits before
 * users continue to setup steps.
 * 
 * Features:
 * - Benefit overview with visual cards
 * - Continue action to advance onboarding flow
 * - Optional background trigger for initial GMB accounts sync
 * - Internationalization support via next-intl
 */

"use client";

import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, MessageCircle, Globe, Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { updateUserOnboardingStatus } from "@/server/actions/supabase/users.action";
import { ErrorBanner } from "@/components/onboarding/ErrorBanner";
import { ReauthLink } from "@/components/onboarding/reauth-link";
import { createLogger } from "@/lib/logger";

const logger = createLogger('WELCOME-SCREEN');

interface WelcomeScreenProps {
  userId: string;
  redirectPath: string | null;
  errorBannerName: string | undefined;
  clerkUserId: string;
  shouldStartBackgroundSync: boolean;
}

export function WelcomeScreen({
  userId,
  redirectPath,
  errorBannerName = undefined,
  clerkUserId,
  shouldStartBackgroundSync
}: WelcomeScreenProps) {
  const router = useRouter();
  const t = useTranslations("onboarding.welcome");
  const [isLoading, setIsLoading] = useState(false);
  const hasStartedSyncRef = useRef(false);

  //  Determine if user is resuming onboarding (has a redirect path different from welcome)
  const isResuming = redirectPath !== null && !redirectPath.endsWith('/onboarding');

  useEffect(() => {
    if (!shouldStartBackgroundSync || !clerkUserId || hasStartedSyncRef.current) {
      return;
    }

    hasStartedSyncRef.current = true;
    fetch("/api/gmb/sync-accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: clerkUserId }),
    }).catch((error) => {
      logger.error("Failed to trigger Google accounts sync from onboarding welcome", error);
    });
  }, [clerkUserId, shouldStartBackgroundSync]);

  const handleContinue = async () => {
    setIsLoading(true);
    
    try {
      // If user is resuming, redirect to their saved progress
      if (isResuming && redirectPath) {
        router.push(redirectPath);
        return;
      }

      // Update user status to onOrganizationPage before redirecting
      await updateUserOnboardingStatus(userId, 'onOrganizationPage');
      
      // Redirect to step-1
      router.push("/onboarding/step-1");
    } catch (error) {
      logger.error('Error updating onboarding status', error instanceof Error ? error : new Error(String(error)));
      // Still redirect even if status update fails
      setIsLoading(false);
    }
  } 

  return (
    <div className="w-full max-w-2xl space-y-8">
      <div className="text-center space-y-3">
        <div className="mx-auto w-16 h-16 bg-[var(--active)]/10 rounded-2xl flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-[var(--active)]" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-base md:text-lg text-muted-foreground">{t("description")}</p>
      </div>
      {errorBannerName && <ErrorBanner error_banner_name={errorBannerName} />}
      <ol className="space-y-3">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-[var(--active)]/10 text-[var(--active)] flex items-center justify-center text-sm font-semibold">1</div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="w-4 h-4 text-[var(--active)]" />
              <span>{t("benefit1")}</span>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-[var(--active)]/10 text-[var(--active)] flex items-center justify-center text-sm font-semibold">2</div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Globe className="w-4 h-4 text-[var(--active)]" />
              <span>{t("benefit2")}</span>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-[var(--active)]/10 text-[var(--active)] flex items-center justify-center text-sm font-semibold">3</div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageCircle className="w-4 h-4 text-[var(--active)]" />
              <span>{t("benefit3")}</span>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-[var(--active)]/10 text-[var(--active)] flex items-center justify-center text-sm font-semibold">4</div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Bell className="w-4 h-4 text-[var(--active)]" />
              <span>{t("benefit4")}</span>
            </div>
          </div>
        </Card>
      </ol>

      <Button 
        size="lg" 
        className="w-full h-14 cursor-pointer transition-all active:scale-[0.98] hover:shadow-md hover:-translate-y-0.5 bg-[var(--active)] hover:bg-[var(--active)]/90 text-[var(--active-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--active)]/30"
        onClick={handleContinue}
        disabled={isLoading}
      >
        {isLoading 
          ? t("loading") || "Cargando..." 
          : isResuming 
            ? t("continue") || "Continuar registro"
            : t("start")}
      </Button>

      <div className="pt-4">
        <ReauthLink userId={userId} align="center" />
      </div>
    </div>
  );
}
