"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Users } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { formatDate } from "@/lib/utils"
import { DataTablePagination } from "@/components/dashboard/shared/table/data-table-pagination"
import { useTranslations } from "next-intl"
import type { OrganizationWithRelations } from "@/lib/prisma-types"
import type { UserWithOrganizationSummary } from "@/lib/prisma-types"
import type { PaginationMeta } from "@/lib/api-types"

interface OrganizationUsersClientProps {
  users: UserWithOrganizationSummary[]
  pagination: PaginationMeta
  organization: OrganizationWithRelations
}

/**
 * OrganizationUsersClient - Client Component
 * 
 * Displays users belonging to the organization in table format.
 * Renders table with pagination support.
 * 
 * Architecture:
 * - Client Component: Receives data from OrganizationUsersServer
 * - Handles UI rendering and pagination
 * - Uses useTranslations for i18n (Client Component API)
 */
export function OrganizationUsersClient({ 
  users, 
  pagination, 
  organization 
}: OrganizationUsersClientProps) {
  const t = useTranslations("backoffice.organizations.detail.users")
  const tUsers = useTranslations("backoffice.users")

  return (
    <div className="space-y-4">
      {/* Title outside - consistent with other tabs */}
      <div className="px-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" />
          {t("title")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("subtitle", { count: pagination.total })}
        </p>
      </div>

      {/* Pure Data Table - no Card wrapper */}
      {users.length === 0 ? (
        <div className="flex items-center justify-center py-12 border rounded-md">
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.email")}</TableHead>
                  <TableHead>{t("table.role")}</TableHead>
                  <TableHead>{t("table.createdAt")}</TableHead>
                  <TableHead className="text-center">{t("table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const displayName = user.name && user.lastname 
                    ? `${user.name} ${user.lastname}` 
                    : user.name || user.lastname || user.username
                  
                  return (
                    <TableRow key={user.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        {displayName}
                      </TableCell>
                      <TableCell className="text-sm">
                        {user.email || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {tUsers(`roles.${user.role}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(user.created_at)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          asChild
                          variant="link"
                          className="text-sm text-[var(--active)] hover:text-[var(--active)]/90 p-0 h-auto"
                        >
                          <Link href={`/backoffice/users/${user.id}`}>
                            {t("table.view")} »
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <DataTablePagination 
            pagination={pagination}
            mode="server"
          />
        </>
      )}
    </div>
  )
}

