import { getTranslations } from "next-intl/server"
import { Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * UserCountStat Component
 * Server Component that displays total user count
 * Receives count as prop to avoid individual database queries
 */
interface UserCountStatProps {
  count: number
}

export async function UserCountStat({ count }: UserCountStatProps) {
  const tStats = await getTranslations("backoffice.stats")

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {tStats("totalUsers")}
        </CardTitle>
        <Users className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{count}</div>
        <p className="text-xs text-muted-foreground">
          {tStats("platformUsers")}
        </p>
      </CardContent>
    </Card>
  )
}

