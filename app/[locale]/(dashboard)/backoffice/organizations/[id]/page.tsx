import { Suspense } from "react"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { OrganizationDetailHeader } from "@/components/dashboard/organizations/single/organization-detail-header"
import { OrganizationDetailTabsServer } from "@/components/dashboard/organizations/single/organization-detail-tabs-server"

function OrganizationHeaderSkeleton() {
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

interface OrganizationDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    tab?: string
    page?: string
  }>
}

/**
 * Organization detail page.
 * 
 * Displays organization information, users, locations, and payments.
 * Uses Suspense boundaries for progressive rendering of async data.
 */
export default async function OrganizationDetailPage({ 
  params, 
  searchParams 
}: OrganizationDetailPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<OrganizationHeaderSkeleton />}>
        <OrganizationDetailHeader params={params} />
      </Suspense>

      <Separator />

      <Suspense fallback={<TabsSkeleton />}>
        <OrganizationDetailTabsServer params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
