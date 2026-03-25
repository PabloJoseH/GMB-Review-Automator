"use client"

/**
 * Organization table column definitions used in the dashboard listing view.
 *
 * Exports:
 * - `createOrganizationsColumns`: Builds TanStack table columns with localized labels and values.
 *
 * Key entities:
 * - `OrganizationWithLocationCounts`: Row shape including subscription and location counters.
 */
import { ColumnDef } from "@tanstack/react-table"
import { Eye } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTableColumnHeader } from "@/components/dashboard/shared/table/data-table-column-header"
import { formatCountryName, formatRelativeTime } from "@/lib/utils"
import type { OrganizationWithLocationCounts } from "@/lib/prisma-types"

interface ColumnsProps {
  t: (key: string) => string
  tTime?: (key: string, values?: Record<string, number>) => string
  locale: string
  mode?: "client" | "server"
  onToggleSort?: (columnId: string, direction: "asc" | "desc") => void
}

export function createOrganizationsColumns({ t, tTime, locale, mode = "client", onToggleSort }: ColumnsProps): ColumnDef<OrganizationWithLocationCounts>[] {
  return [
    // Row selection (shadcn pattern)
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="dark:data-[state=checked]:bg-[var(--active)] dark:data-[state=checked]:border-[var(--active)]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
          className="dark:data-[state=checked]:bg-[var(--active)] dark:data-[state=checked]:border-[var(--active)]"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "reference",
      id: "reference",
      header: ({ column }) => (
        <div className="text-center">
          <DataTableColumnHeader
            column={column}
            title={t("table.reference")}
            mode={mode}
            onToggleSort={onToggleSort}
          />
        </div>
      ),
      cell: ({ getValue }) => {
        const reference = getValue() as number | null
        return (
          <div className="text-sm font-mono text-center">
            {reference ?? "—"}
          </div>
        )
      },
      sortingFn: "basic",
      enableSorting: true,
    },
    {
      accessorKey: "business_name",
      id: "name",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("table.name")}
          mode={mode}
          onToggleSort={onToggleSort}
        />
      ),
      cell: ({ getValue }) => (
        <div className="font-medium">{getValue() as string || "—"}</div>
      ),
      enableSorting: false,
    },
    {
      id: "country",
      header: () => <div className="text-center">{t("table.country")}</div>,
      cell: ({ row }) => {
        const address = row.original.business_address
        if (!address) return <div className="text-muted-foreground text-center">—</div>
        
        // Extract country code from address format: "address, city, state, country postalCode"
        // The country code is typically the first part of the last comma-separated segment
        const parts = address.split(',')
        const lastPart = parts[parts.length - 1]?.trim()
        const countryCode = lastPart?.split(' ')[0] || null
        
        // Format country code to localized country name
        const countryName = formatCountryName(countryCode, locale)
        
        return (
          <div className="text-sm font-medium text-center">
            {countryName}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      id: "subscriptionStatus",
      header: () => <div className="text-center">{t("table.subscription")}</div>,
      cell: ({ row }) => {
        const subscription = row.original.subscriptions
        if (!subscription) {
          return (
            <div className="flex justify-center">
              <Badge variant="secondary" className="text-xs">
                {t("table.noSubscription")}
              </Badge>
            </div>
          )
        }

        const status = subscription.status
        
        // Define badge styles for each status
        let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "outline"
        let badgeClassName = "text-xs"
        
        if (status === 'active') {
          badgeVariant = "default"
          badgeClassName = "text-xs bg-green-500/20 text-green-700 dark:bg-green-500/30 dark:text-green-400 border-green-500/30"
        } else if (status === 'canceled' || status === 'cancelled' || status === 'paused') {
          badgeVariant = "secondary"
          badgeClassName = "text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
        } else if (status === 'past_due') {
          badgeVariant = "destructive"
          badgeClassName = "text-xs"
        } else if (status === 'trialing') {
          badgeVariant = "outline"
          badgeClassName = "text-xs bg-transparent text-black dark:text-white border-black dark:border-gray-600"
        } else {
          badgeVariant = "outline"
          badgeClassName = "text-xs"
        }

        return (
          <div className="flex justify-center">
            <Badge variant={badgeVariant} className={badgeClassName}>
              {t(`table.subscriptionStatus.${status}`)}
            </Badge>
          </div>
        )
      },
      enableSorting: false,
    },
    {
      id: "renewalDate",
      header: () => <div className="text-center">{t("table.renewalDate")}</div>,
      cell: ({ row }) => {
        const subscription = row.original.subscriptions
        if (!subscription?.periodEnd) {
          return <div className="text-muted-foreground text-center">—</div>
        }

        const renewalDate = new Date(subscription.periodEnd)
        const isExpired = renewalDate < new Date()
        
        return (
          <div className={`text-sm text-center ${isExpired ? 'text-destructive' : 'text-muted-foreground'}`}>
            {renewalDate.toLocaleDateString('es-ES')}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      id: "locations",
      header: () => <div className="text-center">{t("table.locations")}</div>,
      cell: ({ row }) => {
        const totalCount = row.original._count?.locations || 0
        const activeCount = row.original._count?.activeLocations || 0

        if (totalCount === 0) {
          return (
            <div className="text-sm text-center text-muted-foreground">
              —
            </div>
          )
        }

        return (
          <div className="flex justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="font-mono cursor-help">
                  {activeCount}/{totalCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{(t as unknown as (key: string, values?: Record<string, string | number | Date>) => string)(
                  "locations.activeTooltip",
                  { active: activeCount, total: totalCount }
                )}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => (
        <div className="text-center">
          <DataTableColumnHeader
            column={column}
            title={t("table.createdAt")}
            mode={mode}
            onToggleSort={onToggleSort}
          />
        </div>
      ),
      cell: ({ getValue }) => {
        const date = getValue() as Date | string | null
        if (!tTime) {
          return <div className="text-sm text-muted-foreground text-center">—</div>
        }
        return (
          <div className="text-sm text-muted-foreground text-center">
            {formatRelativeTime(date, tTime)}
          </div>
        )
      },
      sortingFn: "datetime",
      enableSorting: true,
    },
    {
      id: "actions",
      header: () => <div className="text-center">{t("table.actions")}</div>,
      cell: ({ row }) => (
        <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-8 w-8"
              >
                <Link href={`/backoffice/organizations/${row.original.id}`}>
                  <Eye className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("actions.view")}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ]
}
