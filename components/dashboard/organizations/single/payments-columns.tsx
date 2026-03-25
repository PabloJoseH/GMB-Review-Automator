"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTableColumnHeader } from "@/components/dashboard/shared/table/data-table-column-header"
import { CopyButton } from "@/components/ui/shadcn-io/copy-button"
import { PaymentDetailDialog } from "./dialogs/payment-detail-dialog"
import { formatDate, formatPaddleAmount, formatNumber } from "@/lib/utils"
import type { OrganizationWithRelations, SerializedPayment } from "@/lib/prisma-types"

interface ColumnsProps {
  t: (key: string) => string
  organization: OrganizationWithRelations
  mode?: "client" | "server"
  onToggleSort?: (columnId: string, direction: "asc" | "desc") => void
}

export function createPaymentsColumns({ t, organization, mode = "server", onToggleSort }: ColumnsProps): ColumnDef<SerializedPayment>[] {
  return [
    {
      accessorKey: "created_at",
      id: "createdAt",
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
        return (
          <div className="text-sm text-muted-foreground text-center">
            {formatDate(date)}
          </div>
        )
      },
      sortingFn: "datetime",
      enableSorting: true,
    },
    {
      accessorKey: "stripe_payment_id",
      id: "stripePaymentId",
      header: () => t("table.paddlePaymentId"),
      cell: ({ getValue }) => {
        const paymentId = getValue() as string
        return (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{paymentId}</span>
            <CopyButton
              content={paymentId}
              variant="ghost"
              size="sm"
              aria-label={t("actions.copyPaymentId")}
            />
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "amount",
      id: "amount",
      header: () => <div className="text-center">{t("table.amount")}</div>,
      cell: ({ row }) => {
        const amount = row.original.amount
        const actualAmount = formatPaddleAmount(amount)
        
        return (
          <div className="text-sm font-semibold text-center">
            {formatNumber(actualAmount, 2)}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "currency",
      id: "currency",
      header: () => <div className="text-center">{t("table.currency")}</div>,
      cell: ({ getValue }) => (
        <div className="text-sm text-center font-medium">
          {(getValue() as string).toUpperCase()}
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: "status",
      id: "status",
      header: () => <div className="text-center">{t("table.status")}</div>,
      cell: ({ getValue }) => {
        const status = getValue() as string
        const statusLower = status.toLowerCase()
        
        let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "outline"
        let badgeClassName = "text-xs"
        
        if (statusLower === 'completed' || statusLower === 'paid') {
          badgeVariant = "default"
          badgeClassName = "text-xs bg-green-500/20 text-green-700 dark:bg-green-500/30 dark:text-green-400 border-green-500/30"
        } else if (statusLower === 'failed' || statusLower === 'error' || statusLower === 'past_due') {
          badgeVariant = "destructive"
          badgeClassName = "text-xs"
        } else if (statusLower === 'pending' || statusLower === 'billed' || statusLower === 'ready' || statusLower === 'draft') {
          badgeVariant = "secondary"
          badgeClassName = "text-xs bg-yellow-500/20 text-yellow-700 dark:bg-yellow-500/30 dark:text-yellow-400 border-yellow-500/30"
        } else if (statusLower === 'refunded' || statusLower === 'canceled' || statusLower === 'cancelled') {
          badgeVariant = "outline"
          badgeClassName = "text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
        }

        return (
          <div className="flex justify-center">
            <Badge variant={badgeVariant} className={badgeClassName}>
              {t(`status.${statusLower}`)}
            </Badge>
          </div>
        )
      },
      enableSorting: false,
    },
    {
      id: "actions",
      header: () => <div className="text-center">{t("table.actions")}</div>,
      cell: ({ row }) => (
        <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip>
            <PaymentDetailDialog
              payment={row.original}
              organization={organization}
            >
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
            </PaymentDetailDialog>
            <TooltipContent>
              <p>{t("actions.viewDetails")}</p>
            </TooltipContent>
          </Tooltip>
          
        </div>
      ),
    },
  ]
}
