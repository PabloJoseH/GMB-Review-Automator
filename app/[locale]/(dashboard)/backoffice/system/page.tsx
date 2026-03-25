import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
import { Skeleton } from "@/components/ui/skeleton"
import { Activity } from "lucide-react"
import { getSystemStats } from "@/server/actions/supabase/pub-sub-log.action"
import { ProcessCountStat } from "@/components/dashboard/system/process-count-stat"
import { RejectCountStat } from "@/components/dashboard/system/reject-count-stat"
import { ErrorsCountStat } from "@/components/dashboard/system/errors-count-stat"
import { AskedCountStat } from "@/components/dashboard/system/asked-count-stat"
import { NotManageCountStat } from "@/components/dashboard/system/not-manage-count-stat"
import SystemLogsTableServer from "@/components/dashboard/system/SystemLogsTableServer"

function StatsLoadingFallback() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="rounded-lg border p-4">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  )
}

function TableLoading() {
  return (
    <div className="space-y-4">
      {/* Table skeleton */}
      <div className="rounded-md border">
        <div className="border-b">
          <div className="flex">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex-1 p-3">
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="divide-y">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex">
              {[...Array(8)].map((__, j) => (
                <div key={j} className="flex-1 p-3">
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between px-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
      </div>
    </div>
  )
}

/**
 * System Stats Cards Component.
 * 
 * Fetches system statistics and renders stat cards.
 */
async function SystemStatsCards() {
  const statsResult = await getSystemStats()
  
  // Extract stats data with safe defaults if action fails
  const stats = statsResult.success && statsResult.data ? statsResult.data : {
    process: 0,
    reject: 0,
    errors: 0,
    asked: 0,
    notManage: 0
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <ProcessCountStat count={stats.process} />
      <RejectCountStat count={stats.reject} />
      <ErrorsCountStat count={stats.errors} />
      <AskedCountStat count={stats.asked} />
      <NotManageCountStat count={stats.notManage} />
    </div>
  )
}

interface SystemPageProps {
  searchParams: Promise<{
    page?: string
  }>
  params: Promise<{ locale: string }>
}

/**
 * System Page.
 * 
 * Displays system statistics and logs for monitoring and debugging.
 * Uses Suspense boundaries for progressive rendering of async data.
 */
export default async function SystemPage({ searchParams, params }: SystemPageProps) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "backoffice.system.logs" })

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-[var(--active)]/10 p-2">
          <Activity className="h-6 w-6 text-[var(--active)]" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {/* Stats Cards with Suspense */}
      <Suspense fallback={<StatsLoadingFallback />}>
        <SystemStatsCards />
      </Suspense>

      {/* Recent Logs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{t("recentLogs")}</h2>
        </div>
        <Suspense fallback={<TableLoading />}>
          <SystemLogsTableServer searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}