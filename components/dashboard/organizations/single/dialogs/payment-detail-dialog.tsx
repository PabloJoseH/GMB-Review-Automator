"use client"

import { useTranslations } from "next-intl"
import { FileText, Calendar, CreditCard, DollarSign, CheckCircle, XCircle, Clock, Hash, Building2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { CopyButton } from "@/components/ui/shadcn-io/copy-button"
import { formatDate, formatPaddleAmount, formatNumber } from "@/lib/utils"
import type { OrganizationWithRelations, SerializedPayment } from "@/lib/prisma-types"

interface PaymentDetailDialogProps {
  payment: SerializedPayment
  organization: OrganizationWithRelations
  children: React.ReactNode
}

export function PaymentDetailDialog({ 
  payment, 
  organization,
  children 
}: PaymentDetailDialogProps) {
  const t = useTranslations("backoffice.organizations.detail.payments.detail")
  const tStatus = useTranslations("backoffice.organizations.detail.payments.status")

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", icon: typeof CheckCircle, label: string }> = {
      completed: { variant: "default", icon: CheckCircle, label: tStatus("completed") },
      pending: { variant: "secondary", icon: Clock, label: tStatus("pending") },
      failed: { variant: "destructive", icon: XCircle, label: tStatus("failed") },
      refunded: { variant: "outline", icon: XCircle, label: tStatus("refunded") },
      draft: { variant: "secondary", icon: Clock, label: tStatus("draft") },
      ready: { variant: "secondary", icon: Clock, label: tStatus("ready") },
      billed: { variant: "secondary", icon: Clock, label: tStatus("billed") },
      paid: { variant: "default", icon: CheckCircle, label: tStatus("paid") },
      past_due: { variant: "destructive", icon: XCircle, label: tStatus("past_due") },
      canceled: { variant: "outline", icon: XCircle, label: tStatus("canceled") },
      cancelled: { variant: "outline", icon: XCircle, label: tStatus("cancelled") },
      error: { variant: "destructive", icon: XCircle, label: tStatus("error") },
    }
    
    const statusInfo = statusMap[status.toLowerCase()] || { 
      variant: "secondary" as const, 
      icon: Clock, 
      label: status 
    }
    
    const Icon = statusInfo.icon
    
    return (
      <Badge 
        variant={statusInfo.variant} 
        className={`flex items-center gap-1.5 ${statusInfo.variant === "default" ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""}`}
      >
        <Icon className="h-3 w-3" />
        {statusInfo.label}
      </Badge>
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="rounded-lg bg-[var(--active)]/10 p-2">
              <FileText className="h-5 w-5 text-[var(--active)]" />
            </div>
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description", { organizationName: organization.business_name || organization.id })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Payment Status */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("status.title")}
              </h3>
              {getStatusBadge(payment.status)}
            </div>
          </div>

          <Separator />

          {/* Payment Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t("info.title")}
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Hash className="h-4 w-4" />
                  <span>{t("info.paddlePaymentId")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium font-mono">{payment.stripe_payment_id}</span>
                  <CopyButton
                    content={payment.stripe_payment_id}
                    variant="ghost"
                    size="sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  <span>{t("info.totalAmount")}</span>
                </div>
                <span className="text-sm font-medium">
                  {formatNumber(formatPaddleAmount(payment.amount), 2)} {payment.currency.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{t("info.createdAt")}</span>
                </div>
                <span className="text-sm font-medium">{formatDate(payment.created_at)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Organization Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t("organization.title")}
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>{t("organization.name")}</span>
                </div>
                <span className="text-sm font-medium">{organization.business_name || "—"}</span>
              </div>

              {organization.organization_clerk_id && (
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Hash className="h-4 w-4" />
                    <span>{t("organization.clerkId")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">
                      {organization.organization_clerk_id}
                    </span>
                    <CopyButton
                      content={organization.organization_clerk_id}
                      variant="ghost"
                      size="sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

