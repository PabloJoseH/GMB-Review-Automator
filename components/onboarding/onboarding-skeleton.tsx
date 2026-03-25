/**
 * Unified Onboarding Skeleton
 * 
 * Generic loading skeleton for all onboarding pages (step-0 through step-4/complete).
 * Designed to work across all steps without being dynamic - provides a consistent
 * loading experience that matches the general structure of onboarding pages.
 * 
 * Structure:
 * - Container with padding matching all onboarding pages
 * - Generic content area that works for welcome, forms, location selection, payment, and complete
 */

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function OnboardingSkeleton() {
  return (
    <div className="container mx-auto flex min-h-screen flex-col items-center px-4 py-12">
      <div className="w-full max-w-4xl space-y-8">
        {/* Header skeleton - works for all steps */}
        <div className="text-center space-y-3">
          <Skeleton className="mx-auto w-16 h-16 rounded-2xl" />
          <Skeleton className="mx-auto h-10 w-64" />
          <Skeleton className="mx-auto h-6 w-96" />
        </div>

        {/* Content skeleton - generic card structure */}
        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="space-y-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
