/**
 * Step 1 Content Server Component
 * 
 * Handles all dynamic logic for onboarding step 1 (organization setup):
 * - Validates authentication and user state
 * - Validates user is in correct onboarding step
 * - Fetches user and organization data for form pre-filling
 * - Handles redirects based on validation
 */

import { getTranslations } from "next-intl/server";
import { OrganizationForm } from "@/components/onboarding/organization-form";
import { StepProgress } from "@/components/onboarding/step-progress";
import { createLogger } from "@/lib/logger";
import { getAuthenticatedUser, hasUserDatabaseError } from "@/lib/auth-helpers";
import { validateAndRedirect } from "@/lib/onboarding-helpers";
import { getOrganizationDataForForm } from "@/server/actions/supabase/users.action";
import { redirect } from "next/navigation";

const logger = createLogger('ONBOARDING-STEP1');

interface Step1ContentServerProps {
  params: Promise<{ locale: string }>;
}

export async function Step1ContentServer({ params }: Step1ContentServerProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding.step1" });
  
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
      logger.info('User accessing step 1', {
        userId: dbUser.id,
        clerkId: clerkUser.id,
        onboardingStatus: dbUser.onboarding_status,
        hasOrganization: !!dbUser.organization_id,
        locale
      });

      // Validate user is in correct step using centralized helper
      // Only client and onOrganizationPage can access step-1
      // User status should go to welcome screen (step 0)
      validateAndRedirect(
        dbUser,
        locale,
        'step-1'
      );
    }

    // Get user data for pre-filling form (with safe defaults)
    const userEmail = clerkUser?.emailAddresses?.[0]?.emailAddress || "";

    // Prepare user data for UserInfoForm (from Supabase dbUser)
    const userInfoData = !hasUserError && dbUser ? {
      name: dbUser.name || "",
      lastname: dbUser.lastname || "",
      email: dbUser.email || userEmail,
      phone: dbUser.wa_id || "",
    } : null;

    // Try to get existing organization data for form hydration
    let existingOrganizationData = null;
    if (!hasUserError && dbUser.organization_id) {
      try {
        const orgDataResult = await getOrganizationDataForForm(clerkUser.id);
        if (orgDataResult.success) {
          existingOrganizationData = orgDataResult.data;
          logger.info('Organization data loaded for form hydration', {
            userId: dbUser.id,
            hasData: !!existingOrganizationData
          });
        }
      } catch (error) {
        logger.warn('Failed to load organization data for form hydration', {
          userId: dbUser.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue without pre-filled data
      }
    }

    return (
      <div className="container mx-auto flex min-h-screen flex-col items-center px-4 py-12">
        <div className="w-full max-w-3xl space-y-8">
          <StepProgress current={1} total={3} title={t("title")} subtitle={t("description")} />
          {!hasUserError && dbUser && (
            <>
              <OrganizationForm 
                userEmail={userEmail} 
                userId={dbUser.id} 
                userInfoData={userInfoData}
                existingData={existingOrganizationData}
                errorBannerName={hasUserError ? 'userNotFound' : undefined} 
              />
            </>
          )}
        </div>
      </div>
    );

  } catch (error) {
    // Check if this is a Next.js redirect (not a real error)
    if (error && typeof error === 'object' && 'digest' in error && 
        typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) {
      throw error; // Re-throw redirect errors
    }
    
    logger.error('Error in step 1 page', error, { locale });
    redirect(`/${locale}/onboarding`);
  }
}

