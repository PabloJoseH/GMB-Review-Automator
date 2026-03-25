/**
 * Sync Locations Button Component
 * 
 * Client component that handles syncing Google My Business accounts and locations.
 * Displays a button that calls syncAllGoogleAccountsWithLocations and refreshes
 * the page on success.
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { syncAllGoogleAccountsWithLocations } from "@/server/actions/gmb/accounts.action";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";
import { useTranslations } from "next-intl";

const logger = createLogger('SYNC-LOCATIONS-BUTTON');

interface SyncLocationsButtonProps {
  clerkId: string;
}

export function SyncLocationsButton({ clerkId }: SyncLocationsButtonProps) {
  const router = useRouter();
  const t = useTranslations("onboarding.step2.sync.syncButton");
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (isSyncing) {
      document.body.style.overflow = 'hidden';
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = '';
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, [isSyncing]);

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      logger.debug('Starting sync for locations', { clerkId });

      const result = await syncAllGoogleAccountsWithLocations(clerkId);

      if (result.success) {
        logger.info('Sync completed successfully', {
          clerkId,
          accountsCount: result.accountsCount,
          locationsCount: result.locationsCount
        });
        toast.success(result.message || t("success"));
        router.refresh();
      } else {
        logger.error('Sync failed', new Error(result.message), { clerkId });
        toast.error(result.message || t("error"));
      }
    } catch (error) {
      logger.error('Error syncing locations', error instanceof Error ? error : new Error(String(error)), { clerkId });
      toast.error(t("errorGeneric"));
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      {isSyncing && (
        <div 
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center"
          onClick={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
            }
          }}
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-4 p-6 bg-card rounded-lg border shadow-lg">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">{t("syncing")}</p>
          </div>
        </div>
      )}
      <Button
        onClick={handleSync}
        disabled={isSyncing}
        variant="secondary"
        className="w-full h-9 cursor-pointer transition-all active:scale-[0.98] hover:shadow-md hover:-translate-y-0.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        {isSyncing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("syncing")}
          </>
        ) : (
          <>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("label")}
          </>
        )}
      </Button>
    </>
  );
}

