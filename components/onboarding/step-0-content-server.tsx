/**
 * Onboarding Content Server Component
 * 
 * Handles all dynamic logic for the onboarding entry page:
 * - Validates authentication and user state
 * - Links Supabase accounts with Clerk for new users
 * - Handles re-authentication scenarios
 * - Initiates Google accounts sync in background
 * - Determines which screen to show (WelcomeScreen or ReauthWarningScreen)
 */

import { redirect } from "@/i18n/navigation";
import { UsersModel } from "@/server/models/supabase/users.model";
import { getBasicUserById, updateUser } from "@/server/actions/supabase/users.action";
import { WelcomeScreen } from "@/components/onboarding/welcome-screen";
import { ReauthWarningScreen } from "@/components/onboarding/reauth-warning-screen";
import { createLogger } from "@/lib/logger";
import { getOnboardingRedirect } from "@/lib/onboarding-helpers";
import { onboarding_status } from "@/app/generated/prisma";
import { getAuthenticatedUser, hasUserDatabaseError, validateGoogleAccessToken } from "@/lib/auth-helpers";
import { auth } from "@clerk/nextjs/server";
import { deleteClerkUser } from "@/server/actions/clerk/user-management.action";
import { ConnectionsModel } from "@/server/models/supabase/connections.model";

const logger = createLogger('ONBOARDING-STEP0');

interface Step0ContentServerProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ u?: string; reauth?: string }>;
}

export async function Step0ContentServer({ params, searchParams }: Step0ContentServerProps) {
  const { locale } = await params;
  const { u: supabaseUserId, reauth } = await searchParams;

  try {
    // Check if user is coming from sign-up but not authenticated
    if (supabaseUserId) {
      const { userId: clerkUserId } = await auth();
      if (!clerkUserId) {
        logger.info('User coming from sign-up but not authenticated, redirecting to sign-in with error', {
          supabaseUserId,
          locale
        });
        return redirect({ href: '/sign-in?error=userAlreadyExists', locale });
      }
    }

    // Get authenticated user from Clerk (searches by clerkUserId)
    let authResult = await getAuthenticatedUser(locale);
    const { clerkUser, clerkUserId } = authResult;

    // If coming from sign-up, fetch user by supabaseUserId to get stored clerk_id
    let supabaseUser = null;
    let storedClerkId = null;

    if (supabaseUserId) {
      const userResult = await getBasicUserById(supabaseUserId);
      if (userResult.success && userResult.data) {
        supabaseUser = userResult.data;
        storedClerkId = supabaseUser.clerk_id;
        
        // Use supabaseUser if getAuthenticatedUser() didn't find the user
        if (!authResult.dbUser || Object.keys(authResult.dbUser).length === 0) {
          authResult.dbUser = supabaseUser;
        }
      }
    }

    // Determine which user to use for verification
    let dbUser = supabaseUser || authResult.dbUser;

    // Verify conditions for reauth scenarios
    const hasStoredClerkId = storedClerkId !== null && storedClerkId !== '';
    const hasDifferentClerkId = hasStoredClerkId && storedClerkId !== clerkUserId;
    const explicitReauthRequest = reauth === 'true';

    // ESCENARIO 2: Reauth=true but same account already connected
    // User requested reauth but connected the same Google account
    if (explicitReauthRequest && hasStoredClerkId && !hasDifferentClerkId) {
      logger.warn('Reauth requested but same account already connected', {
        supabaseUserId,
        storedClerkId,
        clerkUserId,
        locale
      });
      return redirect({ href: '/sign-in?error=accountAlreadyConnected', locale });
    }

    // ESCENARIO 4: No reauth flag but different account connected
    // User connected different account without explicit reauth request
    if (!explicitReauthRequest && hasDifferentClerkId) {
      logger.error('Different account connected without reauth flag', {
        supabaseUserId,
        storedClerkId,
        newClerkId: clerkUserId,
        locale
      });
      
      // Delete the new Clerk user that was created by mistake
      await deleteClerkUser(clerkUserId);
      
      const redirectHref = supabaseUserId 
        ? `/sign-in?error=accountMismatch&u=${encodeURIComponent(supabaseUserId)}`
        : '/sign-in?error=accountMismatch';
      
      return redirect({ href: redirectHref, locale });
    }

    // ESCENARIO 3: Reauth=true with different account
    // User explicitly requested reauth and connected different account
    const needsReauth = explicitReauthRequest && hasDifferentClerkId;

    if (needsReauth && supabaseUser) {
      logger.info('User needs re-authentication', {
        dbUserId: supabaseUser.id,
        storedClerkId: storedClerkId,
        currentClerkId: clerkUserId,
        locale
      });
      
      return (
        <div className="container mx-auto flex min-h-screen flex-col items-center px-4 py-12">
          <ReauthWarningScreen dbUser={supabaseUser} clerkUserId={clerkUserId} clerkEmail={clerkUser.emailAddresses[0]?.emailAddress || ''} />
        </div>
      );
    }

    // SCENARIO 1: Normal registration - continue with account linking
    // User has no stored clerk_id or same clerk_id (first time registration)
    
    let needsSync = false;

    // Link accounts if user just signed up
    if (dbUser !== null && supabaseUserId) {
      logger.info('Linking Supabase user with Clerk user', { clerkUserId, supabaseUserId });
      const userResult = await getBasicUserById(supabaseUserId);
      if (userResult.success && userResult.data) {
        const supabaseUser = userResult.data;
        if (supabaseUser.organization_id === null || supabaseUser.organization_id === '') {
          dbUser = await UsersModel.updateUserWithcreateEmptyOrganization(supabaseUserId, { 
            clerk_id: clerkUserId,
            email: clerkUser.emailAddresses[0]?.emailAddress || supabaseUser.email,
            name: clerkUser.firstName || supabaseUser.name,
            lastname: clerkUser.lastName || supabaseUser.lastname,
          });
          /** Mark that sync is needed - will be executed in background */
          logger.info('User needs Google accounts sync', { clerkUserId });
          needsSync = true;
        } else {
          const updateResult = await updateUser(supabaseUserId, { 
            clerk_id: clerkUserId,
            email: clerkUser.emailAddresses[0]?.emailAddress || supabaseUser.email,
            name: clerkUser.firstName || supabaseUser.name,
            lastname: clerkUser.lastName || supabaseUser.lastname,
          });
          if (updateResult.success && updateResult.data) {
            dbUser = updateResult.data;
          } else {
            logger.error('Failed to update user during linking', {
              supabaseUserId,
              clerkUserId,
              error: updateResult.error
            });
          }
        }
      } else {
        logger.warn('User not found for linking', {
          supabaseUserId,
          clerkUserId,
          error: userResult.error
        });
      }
    }
    authResult = { dbUser: dbUser, clerkUser: clerkUser, clerkUserId: clerkUserId };
    
    // Check if organization has connections (if organization exists)
    // needsSync should be true if no organization OR if organization has no connections
    if (dbUser && dbUser.organization_id && !needsSync) {
      const connectionsCount = await ConnectionsModel.count({
        organization_id: dbUser.organization_id
      });
      if (connectionsCount === 0) {
        logger.info('Organization has no connections, sync needed', {
          organizationId: dbUser.organization_id,
          clerkUserId
        });
        needsSync = true;
      }
    }
    
    // Check if user has an error
    const hasUserError = hasUserDatabaseError(authResult);
    if (hasUserError) {
      logger.error('User not found in database after linking attempt', { 
        clerkUserId, 
        supabaseUserId, 
        dbUser,
        locale 
      });
    } else if (dbUser) {
      logger.info('User accessing onboarding', {
        userId: dbUser.id,
        clerkId: clerkUserId,
        onboardingStatus: dbUser.onboarding_status,
        hasOrganization: !!dbUser.organization_id,
        locale
      });
    }

    // Validate Google access token before continuing
    if (!hasUserError && clerkUserId) {
      await validateGoogleAccessToken(clerkUserId, locale);
    }

    // Determine whether onboarding should trigger background account sync.
    const shouldStartBackgroundSync =
      !hasUserError &&
      !!dbUser &&
      !needsReauth &&
      (needsSync || (dbUser.onboarding_status === onboarding_status.user && !dbUser.organization_id))

    if (shouldStartBackgroundSync) {
      logger.info('Scheduling Google accounts sync from onboarding entry', {
        clerkUserId: clerkUser.id,
        needsSync,
        onboardingStatus: dbUser.onboarding_status,
        hasOrganization: !!dbUser.organization_id
      })
    } else if (!hasUserError && dbUser) {
      logger.info('Skipping Google accounts sync - already processed or not needed', {
        clerkUserId: clerkUser.id,
        onboardingStatus: dbUser.onboarding_status,
        hasOrganization: !!dbUser.organization_id,
        needsSync,
        needsReauth
      });
    }

    // Check if user should be redirected to a different page (only if no error)
    const redirectPath = !hasUserError && dbUser ? getOnboardingRedirect(
      dbUser.onboarding_status,
      !!dbUser.organization_id,
      '',
      'welcome'
    ) : null;

    if (!hasUserError && dbUser) {
      logger.info('Rendering WelcomeScreen', { 
        clerkUserId: clerkUser.id,
        onboardingStatus: dbUser.onboarding_status,
        redirectPath
      });
    }

    return (
      <div className="container mx-auto flex min-h-screen flex-col items-center px-4 py-12">
        <WelcomeScreen 
          userId={dbUser.id} 
          redirectPath={redirectPath}
          errorBannerName={hasUserError ? "userNotFound" : undefined}
          clerkUserId={clerkUserId}
          shouldStartBackgroundSync={shouldStartBackgroundSync}
        />
      </div>
    );

  } catch (error) {
    // Check if this is a Next.js redirect (not a real error)
    if (error && typeof error === 'object' && 'digest' in error && 
        typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) {
      throw error; // Re-throw redirect errors
    }
    
    logger.error('Error in onboarding page', error, { locale });
    // If error occurs and user came from sign-up, redirect with error parameter
    if (supabaseUserId) {
      return redirect({ href: '/sign-in?error=userAlreadyExists', locale });
    }
    return redirect({ href: '/sign-in', locale });
  }
}

