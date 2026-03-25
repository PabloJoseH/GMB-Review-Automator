/**
 * Reauth Warning Screen Component - Warning screen for account re-authentication
 * 
 * This component displays a warning message when a user is about to replace their
 * previous Google account data with new account data. It warns the user that their
 * previous Google account data will be deleted and replaced with the current account data.
 * 
 * Features:
 * - Warning message about data replacement
 * - Continue button to proceed with re-authentication
 * - Internationalization support with next-intl
 * - Client-side component for user interaction
 */

"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { updateUser, updateUserOnboardingStatus } from "@/server/actions/supabase/users.action";
import { deleteClerkUser } from "@/server/actions/clerk/user-management.action";
import { createOrganizationMembership } from "@/server/actions/clerk/organizationMemberships.action";
import { getOrganizationById } from "@/server/actions/supabase/organizations.action";
import { users } from "@/app/generated/prisma";
import { createLogger } from "@/lib/logger";
import { APP_CONSTANTS } from "@/lib/constants";
import { resetOrganizationData } from "@/server/actions/supabase/organizations.action";

const logger = createLogger('REAUTH-WARNING-SCREEN');

/**
 * Props for `ReauthWarningScreen`.
 */
interface ReauthWarningScreenProps {
  dbUser: users;
  clerkUserId: string;
  clerkEmail: string;
}

export function ReauthWarningScreen({ dbUser, clerkUserId, clerkEmail }: ReauthWarningScreenProps) {
  const t = useTranslations("onboarding.reauthWarning");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async () => {
    setIsLoading(true);
    
    try {

      // reset organization accounts and onboarding status to 'user'
      await resetOrganizationData(dbUser.id);
      await updateUserOnboardingStatus(dbUser.id, 'user');
      
      // Step 1: Update the user's clerk_id in the database with the new Clerk user ID
      const updateResult = await updateUser(dbUser.id, { clerk_id: clerkUserId, email: clerkEmail });
      
      if (!updateResult.success) {
        throw new Error(updateResult.error || 'Failed to update user');
      }

      logger.info('User clerk_id updated successfully', {
        userId: dbUser.id,
        oldClerkId: dbUser.clerk_id,
        newClerkId: clerkUserId
      });

      // Step 2: Connect to Clerk organization if it exists
      if (dbUser.organization_id) {
        const orgResult = await getOrganizationById(dbUser.organization_id);
        
        if (orgResult.success && orgResult.data?.organization_clerk_id) {
          const membershipResult = await createOrganizationMembership({
            userId: clerkUserId,
            organizationId: orgResult.data.organization_clerk_id,
            role: 'org:admin' // Default role for organization creator/owner
          });
          
          if (!membershipResult.success) {
            logger.warn('Failed to connect user to Clerk organization', { error: membershipResult.error });
            // Continue anyway - the organization connection is not critical for re-authentication
          } else {
            logger.debug('User connected to Clerk organization successfully', {
              organizationId: orgResult.data.organization_clerk_id,
              userId: clerkUserId
            });
          }
        }
      }
      
      logger.info('Re-authentication completed successfully', {
        userId: dbUser.id,
        clerkUserId: clerkUserId
      });
      
      // Show success toast
      toast.success(t("success") || "Account changed successfully");

      // Step 3: Delete previous Clerk user if it exists
      if (dbUser.clerk_id && dbUser.clerk_id !== clerkUserId) {
        const deleteResult = await deleteClerkUser(dbUser.clerk_id);
        
        if (!deleteResult.success) {
          logger.error('Failed to delete previous Clerk user:', deleteResult.error);
          // Continue anyway - the user might already be deleted or there might be a permission issue
          // We'll still update the clerk_id to the new one
        } else {
          logger.debug('Previous Clerk user deleted successfully', { userId: dbUser.clerk_id });
        }
      }

      // Wait 1 second before redirecting (button stays disabled)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Redirect to welcome screen
      router.push("/onboarding/");
      
    } catch (error) {
      logger.error('Error in re-authentication', error);
      toast.error(t("error") || "An error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl space-y-8">
      <div className="text-center space-y-3">
        <div className="mx-auto w-16 h-16 bg-[var(--active)]/10 rounded-2xl flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-[var(--active)]" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-base md:text-lg text-muted-foreground">{t("description", { companyName: APP_CONSTANTS.brand.companyName })}</p>
      </div>

      <Card className="p-6 border-orange-500/20 bg-orange-500/5">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground uppercase">{t("warningTitle")}</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{t("warningDescription")}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t("whatWillHappen")}</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-[var(--active)]">•</span>
              <span>{t("action1")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--active)]">•</span>
              <span>{t("action2", { companyName: APP_CONSTANTS.brand.companyName })}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--active)]">•</span>
              <span>{t("action3")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--active)]">•</span>
              <span>{t("action4")}</span>
            </li>
          </ul>
        </div>
      </Card>

      <Button 
        size="lg" 
        className="w-full h-14 cursor-pointer transition-all active:scale-[0.98] hover:shadow-md hover:-translate-y-0.5 bg-[var(--active)] hover:bg-[var(--active)]/90 text-[var(--active-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--active)]/30"
        onClick={onSubmit}
        disabled={isLoading}
      >
        {isLoading 
          ? t("loading") || "Loading..." 
          : t("continue") || "Continue"}
      </Button>
    </div>
  );
}

