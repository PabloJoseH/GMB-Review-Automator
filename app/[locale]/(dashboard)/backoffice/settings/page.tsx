import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
import { Settings } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ActiveConfigServer } from "@/components/dashboard/settings/active-config-server"
import GlobalConfigsTableServer from "@/components/dashboard/settings/configs/GlobalConfigsTableServer"

/**
 * Settings Page - System Configuration
 * 
 * Manages global configuration for the system:
 * - Active configuration (editable, creates draft on save)
 * - Configuration history (view and activate previous configs)
 * 
 * Uses Suspense boundaries for progressive rendering of async data.
 */

function ConfigSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  )
}

function TableLoading() {
  return (
    <div className="space-y-4">
      {/* Table skeleton */}
      <div className="rounded-md border">
        <div className="border-b">
          <div className="flex">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex-1 p-3">
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="divide-y">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex">
              {[...Array(5)].map((__, j) => (
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

interface SettingsPageProps {
  searchParams: Promise<{
    page?: string
  }>
  params: Promise<{ locale: string }>
}

export default async function SettingsPage({ searchParams, params }: SettingsPageProps) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "backoffice.settings" })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="rounded-full bg-primary/10 p-2">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {/* Active configuration (editable creates a draft) */}
      <Suspense fallback={<ConfigSkeleton />}>
        <ActiveConfigServer locale={locale} />
      </Suspense>

      {/* Configurations table (view + activate) */}
      <div className="space-y-4 mt-8">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{t("configs.title")}</h2>
        </div>
        <Suspense fallback={<TableLoading />}>
          <GlobalConfigsTableServer searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}