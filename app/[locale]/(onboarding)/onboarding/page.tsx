/**
 * Onboarding Page - Main entry point for the onboarding process
 * 
 * Handles authentication validation, account linking, and conditional rendering.
 * Dynamic content (auth validation, redirects) wrapped in Suspense for progressive loading.
 */

import { Suspense } from "react";
import { Step0ContentServer } from "@/components/onboarding/step-0-content-server";
import { OnboardingSkeleton } from "@/components/onboarding/onboarding-skeleton";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ u?: string; reauth?: string }>;
}

export default async function OnboardingPage({ params, searchParams }: PageProps) {
  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <Step0ContentServer params={params} searchParams={searchParams} />
    </Suspense>
  );
}
