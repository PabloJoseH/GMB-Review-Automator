"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MapPin, Calendar, Settings, CreditCard } from "lucide-react"
import { ConnectionConfigDialog } from "@/components/dashboard/users/single/dialogs/connection-config-dialog"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDate } from "@/lib/utils"
import { DataTablePagination } from "@/components/dashboard/shared/table/data-table-pagination"
import { useTranslations } from "next-intl"
import type { UserWithOrganization } from "@/lib/prisma-types"
import type { ConnectionWithLocationCount } from "@/server/actions/supabase/connections.action"
import type { PaginationMeta } from "@/lib/api-types"

interface UserConnectionsClientProps {
  connections: ConnectionWithLocationCount[]
  pagination: PaginationMeta
  user: UserWithOrganization
}

/**
 * UserConnectionsClient - Client Component
 * 
 * Displays Google My Business connections for a user's organization.
 * Renders cards with pagination support.
 * 
 * Architecture:
 * - Client Component: Receives data from UserConnectionsServer
 * - Handles UI rendering and pagination
 * - Uses useTranslations for i18n (Client Component API)
 */
export function UserConnectionsClient({ 
  connections, 
  pagination, 
  user 
}: UserConnectionsClientProps) {
  const t = useTranslations("backoffice.users.detail.connections")

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t("title")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("count", { count: pagination.total })}
          </p>
        </div>
      </div>

      {connections.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              {t("empty")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {connections.map((connection) => (
              <Card key={connection.id} className="relative">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3 flex-1 min-w-0">
                      {/* Status Badge + Account ID */}
                      <div className="flex items-center gap-3">
                        {/* Pub/Sub Status Badge */}
                        <Badge 
                          variant={connection.pub_sub ? "default" : "secondary"}
                          className={`text-xs font-medium ${connection.pub_sub ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : "bg-gray-100 text-gray-600"}`}
                        >
                          {connection.pub_sub ? t("active") : t("inactive")}
                        </Badge>
                        
                        {/* Account ID as main title */}
                        <CardTitle className="text-base font-medium font-mono text-gray-900 dark:text-gray-100 truncate">
                          {connection.external_account_id}
                        </CardTitle>
                      </div>
                      
                      {/* Account Type Badge */}
                      {connection.type && (
                        <Badge variant="outline" className="text-xs w-fit bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600">
                          {connection.type}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Single configuration button that opens dialog */}
                    <Tooltip>
                        <ConnectionConfigDialog
                          connectionId={connection.id}
                          externalAccountId={connection.external_account_id}
                          userId={user.id}
                          pubSub={connection.pub_sub}
                          locations={connection.locations || []}
                          totalLocationsCount={connection._count?.locations || 0}
                        >
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="icon"
                            className="h-8 w-8"
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                      </ConnectionConfigDialog>
                      <TooltipContent>
                        <p>{t("configTooltip")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  {/* Connection Info */}
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {formatDate(connection.created_at)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      <span>
                        {connection._count?.locations || 0} {t("locationsCount")}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
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

