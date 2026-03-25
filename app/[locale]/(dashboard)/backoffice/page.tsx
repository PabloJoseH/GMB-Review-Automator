import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StatsCardsServer } from "@/components/dashboard/home/stats-cards-server"
import { RecentUsers } from "@/components/dashboard/home/recent-users"

/**
 * Backoffice Dashboard Home Page
 * 
 * Displays dashboard statistics and recent user activity. Pending.
 * Uses Suspense boundaries for progressive rendering of async data.
 */

function StatsLoadingFallback() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-4 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ActivityLoadingFallback() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[...Array(2)].map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default async function BackofficePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "backoffice.dashboard" })

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Stats Cards */}
      <Suspense fallback={<StatsLoadingFallback />}>
        <StatsCardsServer />
      </Suspense>

      {/* Recent Activity */}
      <Suspense fallback={<ActivityLoadingFallback />}>
        <div className="grid gap-4 md:grid-cols-2">
          <RecentUsers locale={locale} />
        </div>
      </Suspense>
    </div>
  )
}
