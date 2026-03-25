/**
 * Onboarding Step 3 Page - Stripe Payment Setup
 * 
 * Handles authentication validation and payment setup rendering.
 * Dynamic content (auth validation, data fetching) wrapped in Suspense for progressive loading.
 */

import { Suspense } from "react";
import { Step3ContentServer } from "@/components/onboarding/step-3-content-server";
import { OnboardingSkeleton } from "@/components/onboarding/onboarding-skeleton";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function Step3Page({ params }: PageProps) {
  await params; 
  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <Step3ContentServer params={params} />
    </Suspense>
  );
}

