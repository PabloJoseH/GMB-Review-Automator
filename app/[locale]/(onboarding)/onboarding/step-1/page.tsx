/**
 * Onboarding Step 1 Page - Organization Setup
 * 
 * Handles authentication validation and organization form rendering.
 * Dynamic content (auth validation, data fetching) wrapped in Suspense for progressive loading.
 */

import { Suspense } from "react";
import { Step1ContentServer } from "@/components/onboarding/step-1-content-server";
import { OnboardingSkeleton } from "@/components/onboarding/onboarding-skeleton";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function Step1Page({ params }: PageProps) {
  const { locale } = await params;

  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <Step1ContentServer params={params} />
    </Suspense>
  );
}

