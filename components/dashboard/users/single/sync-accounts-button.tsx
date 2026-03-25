"use client"

import { useState } from "react"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"

/**
 * @fileoverview Client-only button used within the user detail header to
 * trigger the GMB sync accounts API for the linked Clerk identity.
 *
 * @remarks
 * Exports:
 * - `SyncAccountsButton`: Renders an outlined button that posts to `/api/gmb/sync-accounts`.
 */

interface SyncAccountsButtonProps {
  clerkId: string
}

export function SyncAccountsButton({ clerkId }: SyncAccountsButtonProps) {
  const t = useTranslations("backoffice.users")
  const [isPending, setIsPending] = useState(false)

  const handleSync = async () => {
    setIsPending(true)

    try {
      const response = await fetch("/api/gmb/sync-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: clerkId }),
      })

      if (response.ok) {
        toast.success(t("syncAccounts.success"))
        return
      }

      const payload = await response.json().catch(() => null)
      toast.error(payload?.message || t("syncAccounts.error"))
    } catch (error) {
      toast.error(t("syncAccounts.error"))
      console.error(error)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={isPending}
    >
      <RefreshCw className="mr-2 h-4 w-4" />
      {isPending ? t("syncAccounts.pending") : t("syncAccounts.button")}
    </Button>
  )
}

