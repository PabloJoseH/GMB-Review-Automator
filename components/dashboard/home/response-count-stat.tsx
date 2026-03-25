import { getTranslations } from "next-intl/server"
import { MessageSquare } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * ResponseCountStat Component
 * Server Component that displays total response count
 * Receives count as prop to avoid individual database queries
 * 
 * TODO: Implement actual responses count when reviews_responses table is ready
 */
interface ResponseCountStatProps {
  count: number
}

export async function ResponseCountStat({ count }: ResponseCountStatProps) {
  const tStats = await getTranslations("backoffice.stats")

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {tStats("responses")}
        </CardTitle>
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{count > 0 ? count : "—"}</div>
        <p className="text-xs text-muted-foreground">
          {tStats("automatedResponses")}
        </p>
      </CardContent>
    </Card>
  )
}

