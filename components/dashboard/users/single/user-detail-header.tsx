/**
 * @fileoverview Server header for the user detail page, handling navigation and user actions.
 * 
 * @remarks
 * - Loads the Clerk user status, location count, and organization context for the header controls.
 * - Shows navigation, avatar, and the `UserActionsDropdown` which owns sync actions.
 * 
 * @exports UserDetailHeader
 */
import { ArrowLeft, User } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { notFound } from "next/navigation"
import { countActiveLocationsByOrganizationId } from "@/server/actions/supabase/locations.action"
import { getUserStatus } from "@/server/actions/clerk/user-management.action"
import { getUserById } from "@/server/actions/supabase/users.action"
import { UserActionsDropdown } from "@/components/dashboard/users/single/user-actions-dropdown"
import { WhatsAppMessageMenu } from "@/components/dashboard/shared/whatsapp-message-menu"
import { createLogger } from "@/lib/logger"

const logger = createLogger('USER_DETAIL_HEADER')

interface UserDetailHeaderProps {
  params: Promise<{ id: string }>
}

/**
 * Server component that fetches and displays user header information.
 * 
 * Fetches user data by ID and optional Clerk status. Renders user name,
 * navigation controls, and action buttons (WhatsApp, user actions).
 * Must be wrapped in Suspense boundary.
 */
export async function UserDetailHeader({ params }: UserDetailHeaderProps) {
  const { id } = await params
  const result = await getUserById(id)
  
  if (!result.success || !result.data) {
    logger.error('User not found', null, { userId: id })
    notFound()
  }
  
  const user = result.data
  
  let userStatus = null
  if (user.clerk_id) {
    try {
      const statusResult = await getUserStatus(user.clerk_id)
      if (statusResult.success && statusResult.data) {
        userStatus = statusResult.data
      }
    } catch (error) {
      logger.error('Failed to fetch Clerk user status', error, { clerkId: user.clerk_id })
    }
  }

  const organization = user.organizations_users_organization_idToorganizations
  const activeLocationsCount = organization
    ? await countActiveLocationsByOrganizationId(organization.id)
    : 0
  const normalizedUserStatus = userStatus ?? { banned: false, locked: false }
  
  const displayName = user.name && user.lastname 
    ? `${user.name} ${user.lastname}` 
    : user.name || user.lastname || user.username
  
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/backoffice/users">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-(--active)/10 p-2">
            <User className="h-6 w-6 text-active" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{displayName}</h1>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* WhatsApp Message Menu - Client Component */}
        <WhatsAppMessageMenu 
          userId={user.id} 
          disabled={!user.wa_id}
        />

        {/* User Actions Dropdown - Client Component */}
        <UserActionsDropdown 
          user={user}
          userStatus={normalizedUserStatus}
          organization={organization ?? null}
          activeLocationsCount={activeLocationsCount}
        />
      </div>
    </div>
  )
}

