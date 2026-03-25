import { getTranslations } from "next-intl/server"
import { Building2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * OrganizationCountStat Component
 * Server Component that displays total organization count
 * Receives count as prop to avoid individual database queries
 */
interface OrganizationCountStatProps {
  count: number
}

export async function OrganizationCountStat({ count }: OrganizationCountStatProps) {
  const tStats = await getTranslations("backoffice.stats")

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {tStats("organizations")}
        </CardTitle>
        <Building2 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{count}</div>
        <p className="text-xs text-muted-foreground">
          {tStats("activeOrganizations")}
        </p>
      </CardContent>
    </Card>
  )
}

