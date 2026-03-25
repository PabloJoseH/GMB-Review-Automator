/**
 * Step 2 Content Server Component
 * 
 * Handles all dynamic logic for onboarding step 2 (location selection):
 * - Validates authentication and user state
 * - Validates user has organization and is in correct onboarding step
 * - Fetches user locations from Google My Business
 * - Handles redirects based on validation
 */

import { getTranslations } from "next-intl/server";
import { createLogger } from "@/lib/logger";
import { getUserLocations } from "@/server/actions/gmb/locations.action";
import { LocationSelection } from "@/components/onboarding/location-selection";
import { StepProgress } from "@/components/onboarding/step-progress";
import { locations } from "@/app/generated/prisma";
import { getAuthenticatedUser, hasUserDatabaseError } from "@/lib/auth-helpers";
import { validateAndRedirect } from "@/lib/onboarding-helpers";
import { redirect } from "next/navigation";

const logger = createLogger('ONBOARDING-STEP2');

interface Step2ContentServerProps {
  params: Promise<{ locale: string }>;
}

export async function Step2ContentServer({ params }: Step2ContentServerProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding.step2" });
  
  try {
    // Get authenticated user and check for database errors
    const authResult = await getAuthenticatedUser(locale);
    const { clerkUser, dbUser } = authResult;
    const hasUserError = hasUserDatabaseError(authResult);

    // Log error if user not found in database
    if (hasUserError) {
      logger.error('User not found in database', { 
        clerkUserId: clerkUser?.id, 
        locale,
        error: authResult.error 
      });
    } else {
      logger.info('User accessing step 2', {
        userId: dbUser.id,
        clerkId: clerkUser.id,
        onboardingStatus: dbUser.onboarding_status,
        hasOrganization: !!dbUser.organization_id,
        locale
      });

      // Check if user has organization (required for step 2)
      if (!dbUser.organization_id) {
        logger.warn('User without organization accessing step 2', {
          userId: dbUser.id,
          locale
        });
        redirect(`/${locale}/onboarding/step-1`);
      }

      // Validate user is in correct step using centralized helper
      validateAndRedirect(
        dbUser,
        locale,
        'step-2'
      );
    }

    // Step 2: Get user locations for selection (only if no error)
    let locationsData: unknown[] = [];
    if (!hasUserError && clerkUser) {
      const locationsResult = await getUserLocations(clerkUser.id);
      const dbLocations = locationsResult.locations || [];

      // Map to plain serializable objects for client component
      locationsData = dbLocations.map((loc) => {
        // Ensure the ID is properly formatted as a string UUID
        const locationId = loc.id ? String(loc.id) : null;
        
        if (!locationId) {
          logger.error('Location found with invalid ID', { 
            locationName: loc.name,
            rawId: loc.id,
            idType: typeof loc.id 
          });
          throw new Error(`Location found with invalid ID: ${loc.name}`);
        }
        
        return {
          id: locationId,
          name: loc.name ?? null,
          address_line1: loc.address_line1 ?? null,
          address_line2: loc.address_line2 ?? null,
          city: loc.city ?? null,
          region: loc.region ?? null,
          phone: loc.phone ?? null,
          website: loc.website ?? null,
          primary_category: loc.primary_category ?? null,
          status: (loc.status as string) ?? 'inactive',
        };
      });

      logger.info('Retrieved user locations', { 
        userId: dbUser.id, 
        totalLocations: locationsData.length 
      });
    }

    return (
      <div className="container mx-auto flex min-h-screen flex-col items-center px-4 py-12 w-full max-w-full">
        <div className="w-full max-w-4xl space-y-8 min-w-0">
          <StepProgress current={2} total={3} title={t("title")} subtitle={t("description")} />
          <LocationSelection 
            locations={locationsData as locations[]}
            userId={dbUser.id}
            errorBannerName={hasUserError ? 'userNotFound' : undefined}
          />
        </div>
      </div>
    );

  } catch (error) {
    // Check if this is a Next.js redirect (not a real error)
    if (error && typeof error === 'object' && 'digest' in error && 
        typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) {
      throw error; // Re-throw redirect errors
    }
    
    logger.error('Error in step 2 page', error, { locale });
    redirect(`/${locale}/onboarding/step-1`);
  }
}

