"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Settings as SettingsIcon, Zap, RefreshCw } from "lucide-react"
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
import { updateMultipleLocationsStatusByIds } from "@/server/actions/supabase/locations.action"
import { createLogger } from "@/lib/logger"

const logger = createLogger('LOCATION-CONFIG')

interface LocationConfigDialogProps {
  locationId: string
  locationName: string
  isActive: boolean
  userId: string // Reserved for future use when implementing other actions
  children: React.ReactNode
}

export function LocationConfigDialog({ 
  locationId, 
  locationName, 
  isActive, 
  userId,
  children 
}: LocationConfigDialogProps) {
  const router = useRouter()
  const t = useTranslations("backoffice.users.detail.locations.config")
  const [isPending, setIsPending] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(isActive)

  const handleToggleStatus = async (checked: boolean) => {
    setIsPending(true)
    
    try {
      const newStatus = checked ? 'active' : 'inactive'
      // Use the dedicated status update function instead of updateLocation
      const result = await updateMultipleLocationsStatusByIds(
        [locationId], 
        newStatus, 
        userId
      )

      if (result.success) {
        setCurrentStatus(checked)
        toast.success(t("status.updateSuccess"))
        router.refresh()
      } else {
        toast.error(result.error || t("status.updateError"))
      }
    } catch (error) {
      logger.error("Failed to update location status", error instanceof Error ? error : new Error(String(error)))
      toast.error(t("status.updateError"))
    } finally {
      setIsPending(false)
    }
  }

  const handleGetSampleReviews = async () => {
    setIsPending(true)
    try {
      toast.success(t("actions.getSampleReviewsSuccess"))
    } catch (error) {
      toast.error(t("actions.getSampleReviewsError"))
    } finally {
      setIsPending(false)
    }
  }

  const handleUpdateInfo = async () => {
    setIsPending(true)
    try {
      toast.success(t("actions.updateInfoSuccess"))
    } catch (error) {
      toast.error(t("actions.updateInfoError"))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="rounded-lg bg-[var(--active)]/10 p-2">
              <SettingsIcon className="h-5 w-5 text-[var(--active)]" />
            </div>
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description", { locationName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Location Status */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              {t("status.title")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("status.description")}
            </p>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">
                  {currentStatus ? t("status.active") : t("status.inactive")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {currentStatus ? t("status.activeDescription") : t("status.inactiveDescription")}
                </p>
              </div>
              <Switch
                checked={currentStatus}
                onCheckedChange={handleToggleStatus}
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
            <p className="text-sm text-muted-foreground">
              {t("actions.description")}
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={handleGetSampleReviews}
                disabled={isPending}
                className="justify-start"
              >
                <Zap className="mr-2 h-4 w-4" />
                {t("actions.getSampleReviews")}
              </Button>
              <Button
                variant="outline"
                onClick={handleUpdateInfo}
                disabled={isPending}
                className="justify-start"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("actions.updateInfo")}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Coming Soon Alert */}
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
