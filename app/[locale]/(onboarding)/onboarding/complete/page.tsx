/**
 * Onboarding Complete Page - Completion
 * 
 * Handles authentication validation and completion screen rendering.
 * Dynamic content (auth validation, data fetching, notifications) wrapped in Suspense for progressive loading.
 */

import { Suspense } from "react";
import { Step4ContentServer } from "@/components/onboarding/step-4-content-server";
import { OnboardingSkeleton } from "@/components/onboarding/onboarding-skeleton";

interface OnboardingCompletePageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ 
    u?: string;           // WhatsApp user ID (for future webhook integration)
    org?: string;         // Organization ID
    billing?: string;     // Billing status
  }>;
}

export default async function OnboardingCompletePage({ 
  params, 
  searchParams 
}: OnboardingCompletePageProps) {
  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <Step4ContentServer params={params} searchParams={searchParams} />
    </Suspense>
  );
}

