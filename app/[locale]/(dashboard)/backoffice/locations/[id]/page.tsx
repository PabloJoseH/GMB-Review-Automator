import { Suspense } from "react"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { LocationDetailHeader } from "@/components/dashboard/locations/single/location-detail-header"
import { LocationDetailTabsServer } from "@/components/dashboard/locations/single/location-detail-tabs-server"
import { getLocationByIdWithRelations } from "@/server/actions/supabase/locations.action"
import { notFound } from "next/navigation"
import { createLogger } from "@/lib/logger"
import type { SerializedLocationWithFullRelations } from "@/lib/prisma-types"

const logger = createLogger('LOCATION_DETAIL_PAGE')

function LocationHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-9 w-48" />
        </div>
      </div>
    </div>
  )
}

function TabsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

interface LocationDetailPageProps {
  params: Promise<{ locale: string; id: string }>
  searchParams: Promise<{
    tab?: string
    page?: string
  }>
}

/**
 * Location detail page.
 * 
 * Fetches location data once and passes it to child components to avoid redundant queries.
 * Uses Suspense boundary for progressive rendering of async tab content.
 */
export default async function LocationDetailPage({ 
  params, 
  searchParams 
}: LocationDetailPageProps) {
  const { locale, id } = await params
  
  const result = await getLocationByIdWithRelations(id)
  
  if (!result.success || !result.data) {
    logger.error('Location not found', null, { locationId: id })
    notFound()
  }
  
  const location = result.data as SerializedLocationWithFullRelations

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<LocationHeaderSkeleton />}>
        <LocationDetailHeader location={location} locale={locale} />
      </Suspense>

      <Separator />

      <Suspense fallback={<TabsSkeleton />}>
        <LocationDetailTabsServer 
          location={location} 
          params={params} 
          searchParams={searchParams} 
        />
      </Suspense>
    </div>
  )
}
