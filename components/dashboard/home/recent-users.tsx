import { getTranslations } from "next-intl/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { getPaginatedUsers } from "@/server/actions/supabase/users.action"
import { formatRelativeTime } from "@/lib/utils"

/**
 * RecentUsers Component
 * Server Component displaying the latest registered users
 * 
 * Features:
 * - Shows last 5 registered users
 * - Displays name, email, and onboarding status
 * - Avatar with initials fallback
 * - Relative time display (fully internationalized)
 * - Fully internationalized
 * 
 * Performance:
 * - Fetches only 5 users sorted by created_at DESC
 * - Uses minimal data (no relations needed)
 */

interface RecentUsersProps {
  locale: string;
}

export async function RecentUsers({ locale }: RecentUsersProps) {
  const t = await getTranslations({ locale, namespace: "backoffice.dashboard.recentActivity.recentUsers" })
  const tTime = await getTranslations({ locale, namespace: "common.time" })
  
  // Fetch last 5 registered users (lightweight query)
  const result = await getPaginatedUsers({
    page: 1,
    limit: 5,
    sortBy: "created_at",
    sortOrder: "desc",
  })
  
  const users = result.success && result.data ? result.data.users : []
  
  // Helper to get initials from name
  const getInitials = (name: string | null, lastname: string | null, username: string) => {
    if (name && lastname) {
      return `${name[0]}${lastname[0]}`.toUpperCase()
    }
    if (name) {
      return name.substring(0, 2).toUpperCase()
    }
    return username.substring(0, 2).toUpperCase()
  }
  
  // Helper to get badge variant based on onboarding status
  const getStatusVariant = (status: string): "default" | "secondary" | "outline" => {
    return status === "done" ? "default" : "secondary"
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="space-y-4">
            {users.map((user) => {
              const displayName = user.name && user.lastname
                ? `${user.name} ${user.lastname}`
                : user.name || user.lastname || user.username
              
              const initials = getInitials(user.name, user.lastname, user.username)
              
              return (
                <div key={user.id} className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 space-y-1 min-w-0">
                    <p className="text-sm font-medium leading-none truncate">
                      {displayName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email || user.wa_id}
                    </p>
                  </div>
                  
                  <div className="flex flex-col items-end gap-1">
                    <Badge 
                      variant={getStatusVariant(user.onboarding_status)}
                      className="text-xs"
                    >
                      {t(`status.${user.onboarding_status}`)}
                    </Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(user.created_at, tTime)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
