import { getTranslations } from "next-intl/server"
import { Star } from "lucide-react"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Filter } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import ReviewsTableServer from "@/components/dashboard/reviews/ReviewsTableServer"


/**
 * Reviews list page.
 * 
 * Displays paginated example reviews (test reviews) with search and sorting.
 * These are reviews stored while not responding in Google My Business yet.
 * Default sorting: By review date (newest first).
 */

interface ReviewsPageProps {
  searchParams: Promise<{
    page?: string
    search?: string
    sortBy?: string
    sortOrder?: string
  }>
  params: Promise<{ locale: string }>
}

function TableLoading() {
  return (
    <div className="space-y-4">
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0" disabled>
              <Filter className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="start">
            <Skeleton className="h-6 w-24" />
          </PopoverContent>
        </Popover>
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
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex-1 p-3">
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="divide-y">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex">
              {[...Array(7)].map((__, j) => (
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

export default async function ReviewsPage({ searchParams, params }: ReviewsPageProps) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "backoffice.reviews" })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-amber-500/10 p-2">
            <Star className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
      </div>
      <Suspense fallback={<TableLoading />}>
        <ReviewsTableServer searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

