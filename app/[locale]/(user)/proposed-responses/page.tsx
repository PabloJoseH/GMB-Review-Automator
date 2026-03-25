import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import ProposedResponsesListServer from "@/components/user/proposed-responses/ProposedResponsesListServer";

/**
 * Proposed Responses Page
 * 
 * Main page for managing proposed review responses.
 * Users can view, edit, and send proposed responses to Google My Business.
 * 
 * Features:
 * - Filter by location (all locations or specific location)
 * - Pagination
 * - Bulk selection and actions
 * - Individual response editing and sending
 * 
 * Layout structure:
 * - UserHeader: Fixed header (handled by parent layout)
 * - Page content: Title, subtitle, and list of proposed responses
 * - FooterControls: Footer with controls (handled by parent layout)
 */

interface ProposedResponsesPageProps {
  searchParams: Promise<{
    page?: string;
    locationId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
  }>;
  params: Promise<{ locale: string }>;
}

function TableLoading() {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-2 mb-8">
        <Skeleton className="h-9 w-64 mx-auto" />
        <Skeleton className="h-5 w-96 mx-auto" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-10 flex-1" />
      </div>
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-lg border p-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-6 w-6 rounded" />
              </div>
              <Skeleton className="h-20 w-full" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-48" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
    </div>
  );
}

export default async function ProposedResponsesPage({ searchParams, params }: ProposedResponsesPageProps) {
  const { locale } = await params;

  return (
    <Suspense fallback={<TableLoading />}>
      <ProposedResponsesListServer 
        searchParams={searchParams}
        locale={locale}
      />
    </Suspense>
  );
}
