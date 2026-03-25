/**
 * Onboarding Step 2 Page - Location Selection
 * 
 * Handles authentication validation and location selection rendering.
 * Dynamic content (auth validation, data fetching) wrapped in Suspense for progressive loading.
 */

import { Suspense } from "react";
import { Step2ContentServer } from "@/components/onboarding/step-2-content-server";
import { OnboardingSkeleton } from "@/components/onboarding/onboarding-skeleton";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function Step2Page({ params }: PageProps) {
  const { locale } = await params;

  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <Step2ContentServer params={params} />
    </Suspense>
  );
}
