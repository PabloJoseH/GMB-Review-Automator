import { ProposedResponsesListClient } from "./ProposedResponsesListClient";
import type { PaginationMeta } from "@/lib/api-types";
import { getPaginatedProposedResponses } from "@/server/actions/supabase/proposed-responses.action";
import { getUserByClerkId } from "@/server/actions/supabase/users.action";
import type { ProposedResponseWithLocation } from "@/lib/prisma-types";
import { createLogger } from "@/lib/logger";
import { getTranslations } from "next-intl/server";
import { auth } from "@clerk/nextjs/server";

const logger = createLogger('PROPOSED_RESPONSES_SERVER');

/**
 * ProposedResponsesListServer - Server Component
 * 
 * Fetches paginated proposed responses and related data, then passes to Client Component.
 * Architecture: Page → Server Component → Server Actions → Models → DB
 * 
 * Uses auth() to get clerkUserId, wrapped in Suspense in parent page for progressive loading.
 */

interface ProposedResponsesListServerProps {
  searchParams: Promise<{
    page?: string;
    locationId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
  }>;
  locale: string;
}

export default async function ProposedResponsesListServer({ searchParams, locale }: ProposedResponsesListServerProps) {
  const params = await searchParams;
  const t = await getTranslations({ locale, namespace: "user.proposedResponses" });

  // Get clerkUserId from auth (middleware already validated authentication)
  const { userId: clerkUserId } = await auth();
  
  if (!clerkUserId) {
    logger.warn('No userId found in ProposedResponsesListServer (middleware should have caught this)', {});
    return (
      <div className="text-center text-muted-foreground">
        User not found. Please sign in again.
      </div>
    );
  }

  // Calculate "now" snapshot once on server to prevent hydration mismatches
  // This ensures server and client calculate the same relative time
  const now = new Date();

  const userResult = await getUserByClerkId(clerkUserId);
  if (!userResult.success || !userResult.data || !userResult.data.id) {
    logger.warn('User not found in database', { 
      clerkUserId,
      error: userResult.error
    });
    return (
      <div className="text-center text-muted-foreground">
        User not found. Please sign in again.
      </div>
    );
  }

  const dbUser = userResult.data;

  const page = Math.max(1, Number(params.page) || 1);
  const locationId = params.locationId?.trim() || undefined;
  const sortBy = params.sortBy || 'created_at';
  const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';
  const search = params.search?.trim() || undefined;
  const limit = 20;

  let responses: ProposedResponseWithLocation[] = [];
  let pagination: PaginationMeta = {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  };
  let locations: Array<{ id: string; name: string | null }> = [];

  try {
    const result = await getPaginatedProposedResponses({
      page,
      limit,
      locationId,
      userId: dbUser.id,
      sortBy: sortBy as 'created_at' | 'updated_at' | 'create_time',
      sortOrder,
      reviewerName: search,
    });

    if (result.success && result.data) {
      responses = result.data.responses.map(response => ({
        ...response,
        location: response.locations ? {
          id: response.locations.id,
          name: response.locations.name
        } : null
      })) as ProposedResponseWithLocation[];

      pagination = {
        page: result.data.pagination.page,
        limit: result.data.pagination.limit,
        total: result.data.pagination.total,
        totalPages: result.data.pagination.totalPages,
        hasNext: result.data.pagination.hasNext,
        hasPrev: result.data.pagination.hasPrev,
      };

      locations = result.data.uniqueLocations || [];
    }
  } catch (error) {
    logger.error('Error fetching proposed responses', error, {
      userId: dbUser.id,
      page,
      locationId,
      sortBy,
      sortOrder
    });
  }

  const displayUserName = dbUser.name 
    ? `${dbUser.name}${dbUser.lastname ? ` ${dbUser.lastname}` : ''}`
    : "there";

  return (
    <>
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("subtitlePersonalized", { name: displayUserName, count: pagination.total })}
        </p>
      </div>

      <ProposedResponsesListClient 
        responses={responses}
        pagination={pagination}
        currentLocationId={locationId}
        locations={locations}
        currentSearch={search || ""}
        now={now}
        clerkUserId={clerkUserId || undefined}
      />
    </>
  );
}

