/**
 * Step 3 Content Server Component
 * 
 * Handles all dynamic logic for onboarding step 3 (payment setup):
 * - Validates authentication and user state
 * - Validates user has organization and is in correct onboarding step
 * - Fetches organization and selected locations data
 * - Prepares checkout data for Stripe payment setup
 * - Validates Google access token 
 * - Handles redirects based on validation
 */

import { getTranslations } from "next-intl/server";
import { createLogger } from "@/lib/logger";
import { StripePaymentSetup } from "@/components/onboarding/stripe-payment-setup";
import { StepProgress } from "@/components/onboarding/step-progress";
import { OrganizationsModel } from "@/server/models/supabase/organizations.model";
import { locations, opening_hours, connections } from "@/app/generated/prisma";
import { updateUserOnboardingStatus } from "@/server/actions/supabase/users.action";
import { findActiveLocations } from "@/server/actions/supabase/locations.action";
import { getAuthenticatedUser, hasUserDatabaseError, getSafeUserData, validateGoogleAccessToken } from "@/lib/auth-helpers";
import { validateAndRedirect } from "@/lib/onboarding-helpers";
import { redirect } from "next/navigation";

type LocationWithRelations = locations & {
  opening_hours?: opening_hours[];
  connections?: connections;
};

const logger = createLogger('ONBOARDING-STEP3');

interface Step3ContentServerProps {
  params: Promise<{ locale: string }>;
}

export async function Step3ContentServer({ params }: Step3ContentServerProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding.step3" });
  
  try {
    // Get authenticated user and check for database errors
    const authResult = await getAuthenticatedUser(locale);
    const { clerkUser, dbUser } = authResult;
    const hasUserError = hasUserDatabaseError(authResult);

    // Log error if user not found in database and redirect
    if (hasUserError) {
      logger.error('User not found in database.', { 
        clerkUserId: clerkUser?.id, 
        locale,
        error: authResult.error 
      });
      redirect(`/${locale}/onboarding`);
    } else {
      logger.info('User accessing step 3', {
        userId: dbUser.id,
        clerkId: clerkUser.id,
        onboardingStatus: dbUser.onboarding_status,
        hasOrganization: !!dbUser.organization_id,
        locale
      });

      // Check if user has organization (required for step 3)
      if (!dbUser.organization_id) {
        logger.warn('User without organization accessing step 3', {
          userId: dbUser.id,
          locale
        });
        redirect(`/${locale}/onboarding/step-1`);
      }

      // Validate user is in correct step using centralized helper
      validateAndRedirect(
        dbUser,
        locale,
        'step-3'
      );
    }

    // Validate Google access token before continuing
    if (!hasUserError && clerkUser) {
      await validateGoogleAccessToken(clerkUser.id, locale);
    }

    // Get organization data for billing
    const organization = await OrganizationsModel.findOrganizationById(dbUser.organization_id as string);

    if (!organization) {
      logger.error('Organization not found in step 3', { userId: dbUser.id });
      redirect(`/${locale}/onboarding/step-1`);
    }

    // Get selected locations that are active with created by the user
    const locationsResult = await findActiveLocations(dbUser.id);
    
    // Handle error case - findActiveLocations can return error object instead of array
    if (!Array.isArray(locationsResult) || (locationsResult as any).success === false) {
      logger.error('Failed to fetch active locations', { 
        userId: dbUser.id,
        error: (locationsResult as any).error || 'Unknown error'
      });
      await updateUserOnboardingStatus(dbUser.id, 'onLocationPage');
      redirect(`/${locale}/onboarding/step-2`);
    }

    const selectedLocations = locationsResult as locations[];

    if (selectedLocations.length === 0) {
      logger.warn('No selected locations found for user', { userId: dbUser.id });
      await updateUserOnboardingStatus(dbUser.id, 'onLocationPage');
      redirect(`/${locale}/onboarding/step-2`);
    }

    logger.info('Retrieved organization and selected locations', { 
      userId: dbUser.id, 
      organizationId: organization.id,
      selectedLocationsCount: selectedLocations.length 
    });

    const priceInfo = null;

    // Prepare user data for API call - serialize Clerk objects to plain objects
    const userDataForAPI = {
      id: clerkUser.id,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      emailAddresses: clerkUser.emailAddresses.map(email => ({
        id: email.id,
        emailAddress: email.emailAddress
      })),
      imageUrl: clerkUser.imageUrl,
      primaryEmailAddress: clerkUser.primaryEmailAddress ? {
        id: clerkUser.primaryEmailAddress.id,
        emailAddress: clerkUser.primaryEmailAddress.emailAddress
      } : null,
      publicMetadata: JSON.parse(JSON.stringify(clerkUser.publicMetadata)),
      privateMetadata: JSON.parse(JSON.stringify(clerkUser.privateMetadata))
    };

    // Serialize user data for client component (with safe defaults)
    const serializedUser = getSafeUserData(authResult);

    // Serialize organization data (convert Decimal fields to numbers)
    const serializedOrganization = {
      ...organization,
      created_at: organization.created_at?.toISOString(),
      updated_at: organization.updated_at?.toISOString()
    };

    // Serialize locations data (convert Decimal fields to numbers)
    const serializedLocations = selectedLocations.map(location => {
      const locationWithRelations = location as LocationWithRelations;
      
      return {
        ...location,
        lat: location.lat ? Number(location.lat) : null,
        lng: location.lng ? Number(location.lng) : null,
        created_at: location.created_at?.toISOString(),
        updated_at: location.updated_at?.toISOString(),
        // Serialize nested opening_hours if present
        opening_hours: locationWithRelations.opening_hours?.map(hour => ({
          ...hour,
          created_at: hour.created_at?.toISOString(),
          updated_at: hour.updated_at?.toISOString()
        })),
        // Serialize nested connections if present
        connections: locationWithRelations.connections ? {
          ...locationWithRelations.connections,
          created_at: locationWithRelations.connections.created_at?.toISOString(),
          updated_at: locationWithRelations.connections.updated_at?.toISOString()
        } : undefined
      };
    });

    return (
      <div className="container mx-auto flex min-h-screen flex-col items-center px-4 py-12">
        <div className="w-full max-w-4xl space-y-8">
          <StepProgress current={3} total={3} title={t("title")} subtitle={t("description")} />
          
          <StripePaymentSetup 
            user={serializedUser}
            userDataForAPI={userDataForAPI}
            organization={serializedOrganization}
            selectedLocations={serializedLocations}
            userId={dbUser.id}
            locale={locale}
            errorBannerName={hasUserError ? 'userNotFound' : undefined}
            onboardingStatus={dbUser.onboarding_status || undefined}
            priceInfo={priceInfo}
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
    
    logger.error('Error in step 3 page', error, { locale });
    redirect(`/${locale}/onboarding/step-2`);
  }
}

