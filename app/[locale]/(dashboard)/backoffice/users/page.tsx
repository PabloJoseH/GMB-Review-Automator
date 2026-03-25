/**
 * @fileoverview Backoffice users listing page with create-user sheet trigger, toolbar skeleton, and paginated table.
 *
 * @remarks
 * Exports:
 * - `UsersPage`: Server component that loads translations, header, creation sheet trigger, and the table with Suspense.
 */
import { getTranslations } from "next-intl/server"
import { Plus, Users, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import UsersTableServer from "@/components/dashboard/users/UsersTableServer"
import { CreateUserSheet } from "@/components/dashboard/users/create-user-sheet"


interface UsersPageProps {
  searchParams: Promise<{
    page?: string
    search?: string
    status?: string
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

export default async function UsersPage({ searchParams, params }: UsersPageProps) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "backoffice.users" })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-(--active)/10 p-2">
            <Users className="h-6 w-6 text-active" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        <CreateUserSheet>
          <Button className="bg-active text-active-foreground hover:bg-(--active)/90">
            <Plus className="mr-2 h-4 w-4" />
            {t("createUser")}
          </Button>
        </CreateUserSheet>
      </div>
      {/* Users table with pagination, search, and filtering */}
      <Suspense fallback={<TableLoading />}>
        <UsersTableServer searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
