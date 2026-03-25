/**
 * Step 4 Content Server Component (Onboarding Complete)
 * 
 * Handles all dynamic logic for onboarding completion page:
 * - Validates authentication and user state
 * - Subscribes Google account to Pub/Sub for review notifications
 * - Fetches organization data
 * - Handles redirects based on validation
 * 
 * Note: WhatsApp developer message is now sent automatically after reviews processing
 * in processGoogleReviews server action
 */

import { createLogger } from '@/lib/logger';
import { OnboardingComplete } from '@/components/onboarding/OnboardingComplete';
import { subscribeAccountToGooglePubSub } from '@/server/actions/gmb/accounts.action';
import { getAuthenticatedUser, hasUserDatabaseError, getSafeUserData } from '@/lib/auth-helpers';
import { OrganizationsModel } from '@/server/models/supabase/organizations.model';
import { organizations } from '@/app/generated/prisma';
import { getWhatsAppPhoneNumber } from '@/server/actions/supabase/global-config.action';

const logger = createLogger('ONBOARDING-STEP4');

interface Step4ContentServerProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ 
    u?: string;           // WhatsApp user ID (for future webhook integration)
    org?: string;         // Organization ID
    billing?: string;     // Billing status
  }>;
}

interface ReviewsSyncPayload {
  clerkUserId: string
  dbUserId: string
  userData: {
    id: string
    emailAddresses: Array<{ emailAddress: string }>
  }
}

export async function Step4ContentServer({ 
  params, 
  searchParams 
}: Step4ContentServerProps) {
  try {
    const { locale } = await params;
    const { u: whatsappUserId, org: organizationId, billing } = await searchParams;
    
    logger.info('Onboarding complete page access', { 
      locale, 
      whatsappUserId,
      organizationId,
      billingSuccess: billing === 'success'
    });

    // Get authenticated user and check for database errors
    const authResult = await getAuthenticatedUser(locale);
    const { dbUser, clerkUser, clerkUserId } = authResult;
    const hasUserError = hasUserDatabaseError(authResult);

    // Log error if user not found in database
    if (hasUserError) {
      logger.error('User not found in database', { 
        clerkUserId, 
        locale,
        error: authResult.error 
      });
    }

    let organizationFromPromise: Partial<organizations> | null = null;

    if (dbUser?.id) {
      // Step 6: Subscribe account to Google pub/sub (non-blocking)
      subscribeAccountToGooglePubSub(dbUser.id);

      // Start parallel model fetches to reduce latency
      const organizationPromise = dbUser.organization_id
        ? (OrganizationsModel.findOrganizationById(dbUser.organization_id) as Promise<Partial<organizations> | null>)
        : Promise.resolve(null as null);


      // Store organization fetch promise result for later serialization
      organizationFromPromise = await organizationPromise;
    }
    
    // Step 9: Get safe user data with fallbacks
    const serializedUser = getSafeUserData(authResult);
    const reviewsSyncPayload: ReviewsSyncPayload | null =
      dbUser?.id && clerkUserId
        ? {
            clerkUserId,
            dbUserId: dbUser.id,
            userData: {
              id: clerkUser.id,
              emailAddresses: clerkUser.emailAddresses.map((email) => ({
                emailAddress: email.emailAddress
              }))
            }
          }
        : null

    // Get WhatsApp URL from global config
    const whatsappResult = await getWhatsAppPhoneNumber();
    const whatsappNumber = whatsappResult.success && whatsappResult.data ? whatsappResult.data : null;
    const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : 'https://wa.me/';

    logger.info('User validated for onboarding complete', {
      clerkUserId,
      dbUserId: dbUser?.id,
      email: clerkUser?.primaryEmailAddress?.emailAddress,
      organizationId: dbUser?.organization_id,
      locale,
      whatsappUserId,
      hasError: hasUserError
    });

    let serializedOrganization = null;

    if (dbUser?.organization_id) {
      const organization = organizationFromPromise;
      serializedOrganization = {
        id: organization?.id,
        business_id: organization?.business_id,
        business_name: organization?.business_name,
        email: organization?.email,
        primary_phone: organization?.primary_phone,
        business_address: organization?.business_address,
        created_by: organization?.created_by,
        updated_by: organization?.updated_by,
        created_at: organization?.created_at,
        updated_at: organization?.updated_at,
        organization_clerk_id: organization?.organization_clerk_id
      };
    }

    // Step 11: Render onboarding complete client component
    return (
      <OnboardingComplete 
        user={serializedUser} 
        organization={serializedOrganization as organizations}
        organizationId={organizationId || dbUser.organization_id}
        billingSuccess={billing === 'success'}
        whatsappUrl={whatsappUrl}
        reviewsSyncPayload={reviewsSyncPayload}
      />
    );

  } catch (error) {
    // Re-throw Next.js redirect errors so Next handles them natively
    if (error && typeof error === 'object' && 'digest' in error) {
      const errorWithDigest = error as { digest: unknown };
      if (typeof errorWithDigest.digest === 'string' && 
          errorWithDigest.digest.startsWith('NEXT_REDIRECT')) {
        throw error;
      }
    }
    
    logger.error('Error in onboarding complete page', error);
    
    // Error handling - could redirect here if needed
    // For now, let the error propagate to Next.js error boundary
    throw error;
  }
}

