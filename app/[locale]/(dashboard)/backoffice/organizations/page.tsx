import { getTranslations } from "next-intl/server"
import { Building2 } from "lucide-react"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import OrganizationsTableServer from "@/components/dashboard/organizations/OrganizationsTableServer"

/**
 * Organizations list page.
 * 
 * Displays paginated organizations with search and sorting.
 * Default sorting: By creation date (newest first).
 */

interface OrganizationsPageProps {
  searchParams: Promise<{
    page?: string
    search?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }>
  params: Promise<{ locale: string }>
}

function TableLoading() {
  return (
    <div className="space-y-4">
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input disabled placeholder="" />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </div>

      {/* Table skeleton */}
      <div className="rounded-md border">
        <div className="border-b">
          <div className="flex">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex-1 p-3">
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="divide-y">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex">
              {[...Array(6)].map((__, j) => (
                <div key={j} className="flex-1 p-3">
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default async function OrganizationsPage({ searchParams, params }: OrganizationsPageProps) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "backoffice.organizations" })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-[var(--active)]/10 p-2">
          <Building2 className="h-6 w-6 text-[var(--active)]" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>
      <Suspense fallback={<TableLoading />}>
        <OrganizationsTableServer searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

