/**
 * @fileoverview Client dropdown that exposes user moderation and organization actions.
 * 
 * @remarks
 * - Hosts ban/lock/delete flows plus subscription syncing.
 * - Loads helper buttons (`SyncAccountsButton`) inside the contextual menu.
 * 
 * @exports UserActionsDropdown
 */
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Ban,
  MoreVertical,
  Lock,
  Unlock,
  Trash2,
  UserCheck
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createLogger } from "@/lib/logger"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { SyncAccountsButton } from "@/components/dashboard/users/single/sync-accounts-button"
import {
  banUser,
  unbanUser,
  lockUser,
  unlockUser,
  deleteUser
} from "@/server/actions/clerk/user-management.action"
import type { UserWithOrganization } from "@/lib/prisma-types"

const logger = createLogger('USER-ACTIONS')

interface UserActionsDropdownProps {
  user: Pick<UserWithOrganization, "id" | "clerk_id" | "email" | "name" | "lastname">
  userStatus: {
    banned: boolean
    locked: boolean
  }
  organization: UserWithOrganization["organizations_users_organization_idToorganizations"] | null
  activeLocationsCount: number
}

type ActionType = 'ban' | 'unban' | 'lock' | 'unlock' | 'delete'

export function UserActionsDropdown({ user, userStatus, organization, activeLocationsCount }: UserActionsDropdownProps) {
  const t = useTranslations("backoffice.users.detail.actions")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [openAlertDialog, setOpenAlertDialog] = useState(false)
  const [currentAction, setCurrentAction] = useState<ActionType | null>(null)

  const handleAction = async (action: ActionType) => {
    setCurrentAction(action)
    setOpenAlertDialog(true)
  }

  const confirmAction = async () => {
    if (!user.clerk_id) {
      toast.error(t("error.noClerkId"))
      return
    }

    startTransition(async () => {
      let res
      
      try {
        switch (currentAction) {
          case 'ban':
            res = await banUser(user.clerk_id!)
            break
          case 'unban':
            res = await unbanUser(user.clerk_id!)
            break
          case 'lock':
            res = await lockUser(user.clerk_id!)
            break
          case 'unlock':
            res = await unlockUser(user.clerk_id!)
            break
          case 'delete':
            res = await deleteUser(user.clerk_id!, user.id)
            break
          default:
            return
        }

        if (res.success) {
          toast.success(t(`success.${currentAction === 'ban' ? 'banned' : currentAction === 'unban' ? 'unbanned' : currentAction === 'lock' ? 'locked' : currentAction === 'unlock' ? 'unlocked' : 'deleted'}`))
          router.refresh()
        } else {
          toast.error(res.message || t(`error.${currentAction === 'ban' ? 'banned' : currentAction === 'unban' ? 'unbanned' : currentAction === 'lock' ? 'locked' : currentAction === 'unlock' ? 'unlocked' : 'deleted'}`))
        }
      } catch (error) {
        logger.error('Error executing user action', error instanceof Error ? error : new Error(String(error)))
        toast.error(t(`error.${currentAction === 'ban' ? 'banned' : currentAction === 'unban' ? 'unbanned' : currentAction === 'lock' ? 'locked' : currentAction === 'unlock' ? 'unlocked' : 'deleted'}`))
      }
      
      setOpenAlertDialog(false)
      setCurrentAction(null)
    })
  }

  const getAlertDialogContent = () => {
    switch (currentAction) {
      case 'ban':
        return {
          title: t("banUser"),
          description: t("confirmBan"),
          actionText: t("banUser"),
          actionVariant: "destructive" as const,
        }
      case 'unban':
        return {
          title: t("unbanUser"),
          description: t("confirmUnban"),
          actionText: t("unbanUser"),
          actionVariant: "default" as const,
        }
      case 'lock':
        return {
          title: t("lockUser"),
          description: t("confirmLock"),
          actionText: t("lockUser"),
          actionVariant: "destructive" as const,
        }
      case 'unlock':
        return {
          title: t("unlockUser"),
          description: t("confirmUnlock"),
          actionText: t("unlockUser"),
          actionVariant: "default" as const,
        }
      case 'delete':
        return {
          title: t("deleteUser"),
          description: t("confirmDelete"),
          actionText: t("deleteUser"),
          actionVariant: "destructive" as const,
        }
      default:
        return {
          title: "",
          description: "",
          actionText: "",
          actionVariant: "default" as const,
        }
    }
  }

  const dialogContent = getAlertDialogContent()
  const showActionButtons = Boolean(user.clerk_id)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="default" className="h-9 w-9 p-0">
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">{t("title")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t("title")}</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {userStatus?.banned ? (
            <DropdownMenuItem onClick={() => handleAction('unban')} disabled={isPending}>
              <UserCheck className="mr-2 h-4 w-4" />
              <span>{t("unbanUser")}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => handleAction('ban')} disabled={isPending} className="text-red-600 focus:text-red-600">
              <Ban className="mr-2 h-4 w-4" />
              <span>{t("banUser")}</span>
            </DropdownMenuItem>
          )}

          {userStatus?.locked ? (
            <DropdownMenuItem onClick={() => handleAction('unlock')} disabled={isPending}>
              <Unlock className="mr-2 h-4 w-4" />
              <span>{t("unlockUser")}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => handleAction('lock')} disabled={isPending} className="text-orange-600 focus:text-orange-600">
              <Lock className="mr-2 h-4 w-4" />
              <span>{t("lockUser")}</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => handleAction('delete')} disabled={isPending} className="text-red-600 focus:text-red-600">
            <Trash2 className="mr-2 h-4 w-4" />
            <span>{t("deleteUser")}</span>
          </DropdownMenuItem>
          {showActionButtons && (
            <>
              <DropdownMenuSeparator />
              <div className="space-y-3 px-3 py-2">
                {user.clerk_id && (
                  <SyncAccountsButton clerkId={user.clerk_id} />
                )}
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={openAlertDialog} onOpenChange={setOpenAlertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogContent.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialogContent.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction}
              disabled={isPending}
              className={dialogContent.actionVariant === "destructive" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {isPending ? t("loading") : dialogContent.actionText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
