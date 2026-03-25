/**
 * @fileoverview User detail page composed of a header and a tabbed detail section.
 * 
 * @remarks
 * - Wraps `UserDetailHeader` and `UserDetailTabsServer` inside suspense fallbacks.
 * - Provides skeletons during async data loading before the sections hydrate.
 */
import { Suspense } from "react"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { UserDetailHeader } from "@/components/dashboard/users/single/user-detail-header"
import { UserDetailTabsServer } from "@/components/dashboard/users/single/user-detail-tabs-server"

function UserHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-9 w-48" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-10" />
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

interface UserDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    tab?: string
    page?: string
  }>
}


/**
 * User detail page.
 * 
 * Displays user information, connections, locations, and sessions.
 * Uses Suspense boundaries for progressive rendering of async data.
 */
export default async function UserDetailPage({ 
  params, 
  searchParams 
}: UserDetailPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<UserHeaderSkeleton />}>
        <UserDetailHeader params={params} />
      </Suspense>

      <Separator />

      <Suspense fallback={<TabsSkeleton />}>
        <UserDetailTabsServer params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
