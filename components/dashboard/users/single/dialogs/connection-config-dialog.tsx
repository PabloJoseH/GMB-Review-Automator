"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Settings as SettingsIcon, RefreshCw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ConnectionLocationsTable } from "./connection-locations-table"
import { refreshSingleAccount, subscribeSingleAccountToPubSub, unsubscribeSingleAccountFromPubSub } from "@/server/actions/gmb/pub-sub.action"


interface ConnectionConfigDialogProps {
  connectionId: string
  externalAccountId: string
  userId: string
  pubSub: boolean | null
  locations?: { id: string; name: string | null; status: string | null }[]
  totalLocationsCount: number
  children: React.ReactNode
}

export function ConnectionConfigDialog({
  connectionId,
  externalAccountId,
  userId,
  pubSub,
  locations = [],
  totalLocationsCount,
  children,
}: ConnectionConfigDialogProps) {
  const router = useRouter()
  const t = useTranslations("backoffice.users.detail.connections.config")
  const tc = useTranslations("backoffice.users.detail.connections")
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const currentPubSub = Boolean(pubSub)

  const handleRefresh = async () => {
    startTransition(async () => {
      try {
        const result = await refreshSingleAccount(externalAccountId, userId)
        if (result?.success) {
          toast.success(tc("refreshSuccess"))
          router.refresh()
        } else {
          toast.error(result?.message || tc("refreshError"))
        }
      } catch {
        toast.error(tc("refreshError"))
      }
    })
  }

  const handleTogglePubSub = async (enabled: boolean) => {
    startTransition(async () => {
      try {
        if (enabled) {
          const res = await subscribeSingleAccountToPubSub(externalAccountId, userId)
          if (res.success) {
            toast.success(tc("subscribeSuccess"))
            router.refresh()
          } else {
            toast.error(res.message || tc("subscribeError"))
          }
        } else {
          const res = await unsubscribeSingleAccountFromPubSub(externalAccountId, userId)
          if (res.success) {
            toast.success(tc("unsubscribeSuccess"))
            router.refresh()
          } else {
            toast.error(res.message || tc("unsubscribeError"))
          }
        }
      } catch {
        toast.error(enabled ? tc("subscribeError") : tc("unsubscribeError"))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[650px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="rounded-lg bg-[var(--active)]/10 p-2">
              <SettingsIcon className="h-5 w-5 text-[var(--active)]" />
            </div>
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description", { accountId: externalAccountId })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Pub/Sub status */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              {t("pubSub.title")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("pubSub.description")}
            </p>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">
                  {currentPubSub ? tc("active") : tc("inactive")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {currentPubSub ? t("pubSub.activeDescription") : t("pubSub.inactiveDescription")}
                </p>
              </div>
              <Switch
                checked={currentPubSub}
                onCheckedChange={handleTogglePubSub}
                disabled={isPending}
              />
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              {t("actions.title")}
            </Label>
            <div className="flex flex-col gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={isPending}
                    className="justify-start"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                    {tc("refreshTooltip")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tc("refreshTooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <Separator />

          {/* Locations table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold flex items-center gap-2">
                {t("locations.title")}
              </Label>
              <span className="text-sm text-muted-foreground">
                {t("locations.showing", { showing: Math.min(locations.length, totalLocationsCount), total: totalLocationsCount })}
              </span>
            </div>
            <ConnectionLocationsTable 
              connectionId={connectionId}
              initialLocations={locations} 
              totalCount={totalLocationsCount} 
            />
          </div>

          <Alert className="border-primary/20 bg-primary/5">
            <SettingsIcon className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm text-muted-foreground">
              {t("comingSoon")}
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  )
}


