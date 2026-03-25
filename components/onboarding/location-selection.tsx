/**
 * @fileoverview Onboarding step 2 location selector grid with TanStack selection state.
 *
 * @remarks
 * Exports:
 * - `LocationSelection`: Client component that preselects active locations, syncs user selections via server actions, and renders the grid with pagination.
 *
 * Shared entities:
 * - `locations` Prisma type for data shape.
 * - Supabase actions `syncLocationsSelectionForUser` and `updateUserOnboardingStatus` for persistence.
 */
"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MapPin, Globe, AlertCircle, AlertTriangle, Building2 } from "lucide-react";
import type { locations } from "@/app/generated/prisma";
import { useTranslations } from "next-intl";
import { updateMultipleLocationsStatusByIdsDbOnly } from "@/server/actions/supabase/locations.action";
import { updateUserOnboardingStatus } from "@/server/actions/supabase/users.action";
import { ErrorBanner } from "./ErrorBanner";
import { ReauthLink } from "./reauth-link";
import { SyncLocationsButton } from "./sync-locations-button";
import { createLogger } from "@/lib/logger";
import {
  ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  RowSelectionState,
  useReactTable,
} from "@tanstack/react-table";
import { DataTablePagination } from "@/components/dashboard/shared/table/data-table-pagination";

const logger = createLogger('LOCATION-SELECTION');

interface LocationSelectionProps {
  locations: locations[];
  userId: string;
  errorBannerName?: string;
}

export function LocationSelection({ locations, userId, errorBannerName = undefined }: LocationSelectionProps) {
  const router = useRouter();
  const { user: clerkUser } = useUser();
  const t = useTranslations("onboarding.step2");
  const activeLocationIdsFromDb = useMemo(() => {
    return locations
      .filter((location) => location.status === "active")
      .map((location) => String(location.id));
  }, [locations]);

  const initialRowSelection = useMemo<RowSelectionState>(() => {
    const selection: RowSelectionState = {};
    activeLocationIdsFromDb.forEach((locationId) => {
      selection[locationId] = true;
    });
    return selection;
  }, [activeLocationIdsFromDb]);

  const [rowSelection, setRowSelection] = useState<RowSelectionState>(() => initialRowSelection);
  useEffect(() => {
    setRowSelection(initialRowSelection);
  }, [initialRowSelection]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create columns only for TanStack Table state management (not rendered as table)
  const columns = useMemo<ColumnDef<locations>[]>(
    () => [
      {
        id: "select",
        // Column definition needed for row selection, but not rendered
      },
    ],
    []
  );

  const table = useReactTable({
    data: locations,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      rowSelection,
    },
    enableRowSelection: true,
    // Use row ID for selection (location.id as string)
    getRowId: (row) => String(row.id),
    // Set initial page size to 20 (fixed, no selector shown)
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  });

  // Track previous page index for scroll on page change
  const previousPageIndexRef = useRef(table.getState().pagination.pageIndex);
  const locationsGridRef = useRef<HTMLDivElement>(null);
  const currentPageIndex = table.getState().pagination.pageIndex;

  // Scroll to top smoothly when page changes
  useEffect(() => {
    if (previousPageIndexRef.current !== currentPageIndex) {
      previousPageIndexRef.current = currentPageIndex;
      // Scroll to the locations grid smoothly
      locationsGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentPageIndex]);

  // Get all selected locations (across all pages)
  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedLocationIds = selectedRows.map((row) => String(row.original.id));

  const handleSelectAll = () => {
    if (table.getIsAllRowsSelected()) {
      table.toggleAllRowsSelected(false);
    } else {
      table.toggleAllRowsSelected(true);
    }
  };

  const handleSubmit = async () => {
    if (selectedLocationIds.length === 0) {
      setError(t("selection.selectAtLeastOne"));
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Validate selected location IDs before submitting
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const invalidIds = selectedLocationIds.filter(id => !id || typeof id !== 'string' || !uuidRegex.test(id));
      
      if (invalidIds.length > 0) {
        throw new Error(`Invalid location IDs selected: ${invalidIds.join(', ')}`);
      }

      logger.debug("Submitting selected locations", {
        count: selectedLocationIds.length,
        ids: selectedLocationIds,
        userId
      });

      const syncResult = await updateMultipleLocationsStatusByIdsDbOnly(selectedLocationIds, "active", userId);
      
      if (!syncResult.success) {
        throw new Error(syncResult.error || "Failed to synchronize locations");
      }

      logger.debug("Selected locations updated", { data: syncResult.data });

      await updateUserOnboardingStatus(userId, 'onPaymentPage');
      
      // Navigate to step 3
      router.push("/onboarding/step-3");
    } catch (error) {
      logger.error("Error saving selected locations", error instanceof Error ? error : new Error(String(error)));
      setError(t("selection.saveError"));
      setIsSubmitting(false);
    }
  };

  const handleBack = async () => {
    try {
      setIsSubmitting(true);
      // Update onboarding status to go back to organization page
      await updateUserOnboardingStatus(userId, 'onOrganizationPage');
      router.push("/onboarding/step-1");
    } catch (error) {
      logger.error("Error updating onboarding status", error instanceof Error ? error : new Error(String(error)));
      // Navigate anyway even if status update fails
      router.push("/onboarding/step-1");
    }
  };

  // Show no locations found
  if (locations.length === 0) {
    return (
      <div className="space-y-6">
        {/* Warning message about no locations found */}
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-orange-500" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {t("sync.noLocations.title")}
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {t("sync.noLocations.description")}
                </p>
              </div>
            </div>
            {clerkUser?.id && (
              <div className="w-full">
                <SyncLocationsButton clerkId={clerkUser.id} />
              </div>
            )}
          </div>
        </div>
        
        {/* Reauth Link */}
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="flex justify-center">
            <ReauthLink userId={userId} align="center" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full min-w-0">
      {errorBannerName && <ErrorBanner error_banner_name={errorBannerName} />}
      {/* Selection Controls */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center space-x-2 min-w-0 flex-1">
          <Checkbox
            id="select-all"
            checked={table.getIsAllRowsSelected()}
            onCheckedChange={handleSelectAll}
            className="shrink-0 border-2 dark:data-[state=checked]:bg-active dark:data-[state=checked]:border-active dark:data-[state=checked]:text-active-foreground"
          />
          <label htmlFor="select-all" className="text-sm font-medium break-words min-w-0">
            {t("selection.selectAll", { 
              selected: selectedLocationIds.length, 
              total: locations.length 
            })}
          </label>
        </div>
        
        <Badge variant="secondary" className="shrink-0">
          {t("selection.selected", { count: selectedLocationIds.length })}
        </Badge>
      </div>

      {/* Error Message */}
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-600">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Locations Grid - Only show paginated rows */}
      <div ref={locationsGridRef} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {table.getRowModel().rows.map((row) => {
          const location = row.original;
          const isSelected = row.getIsSelected();
          return (
            <Card 
              key={row.id} 
              className={`cursor-pointer transition-all min-w-0 ${
                isSelected 
                  ? 'ring-2 ring-active bg-(--active)/5' 
                  : 'hover:shadow-md hover:ring-1 hover:ring-border'
              }`}
              onClick={() => row.toggleSelected()}
            >
              <CardHeader className="pb-2 px-4 pt-4">
                <div className="flex items-start space-x-4 min-w-0">
                  <Checkbox
                    checked={isSelected}
                    onChange={() => row.toggleSelected()}
                    className="size-6 mt-0.5 shrink-0 border-2 dark:data-[state=checked]:bg-active dark:data-[state=checked]:border-active dark:data-[state=checked]:text-active-foreground"
                  />
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg flex items-center gap-2 break-words">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="break-words">{location.name || t("selection.unnamedLocation")}</span>
                    </CardTitle>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-2 pt-0 px-4 pb-4">
                {location.address_line1 && (
                  <div className="flex items-start space-x-2 text-sm text-muted-foreground min-w-0">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="break-words min-w-0">
                      {location.address_line1}
                      {location.address_line2 && `, ${location.address_line2}`}
                      {location.city && `, ${location.city}`}
                      {location.region && `, ${location.region}`}
                    </span>
                  </div>
                )}
                
                {location.website && (
                  <div className="flex items-start space-x-2 text-sm text-muted-foreground min-w-0">
                    <Globe className="h-4 w-4 shrink-0 mt-0.5" />
                    <a 
                      href={location.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-active hover:text-(--active)/90 hover:underline transition-colors break-all min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {location.website}
                    </a>
                  </div>
                )}
                
                {location.primary_category && (
                  <Badge variant="outline" className="text-xs text-muted-foreground border-border break-words">
                    {location.primary_category.includes('gcid:') 
                      ? location.primary_category.split('gcid:')[1]?.replace(/_/g, ' ') || location.primary_category
                      : location.primary_category.replace(/_/g, ' ')
                    }
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pagination */}
      <DataTablePagination
        table={table}
        mode="client"
      />

      {/* Action Buttons */}
      <div className="flex flex-col md:flex-row md:justify-between gap-6 md:gap-4 pt-6">
        {/* Continue Button - First on mobile, right on desktop */}
        <Button 
          onClick={handleSubmit}
          disabled={isSubmitting || selectedLocationIds.length === 0}
          className="w-full md:flex-1 md:order-2 h-14 cursor-pointer transition-all active:scale-[0.98] hover:shadow-md hover:-translate-y-0.5 bg-active hover:bg-(--active)/90 text-active-foreground focus-visible:ring-2 focus-visible:ring-(--active)/30"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("selection.saving")}
            </>
          ) : (
            t("selection.continueWith", { 
              count: selectedLocationIds.length
            })
          )}
        </Button>
        
        {/* Back Button - Second on mobile, left on desktop */}
        <Button 
          onClick={handleBack}
          disabled={isSubmitting}
          variant="outline"
          className="w-full md:w-auto md:order-1 h-14 px-8 cursor-pointer transition-all active:scale-[0.98] hover:shadow-md hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          {t("selection.backToSetup")}
        </Button>
      </div>

      {/* Reauth Link - Below buttons, aligned left */}
      <div className="pt-4">
        <ReauthLink userId={userId} align="left" />
      </div>
    </div>
  );
}
