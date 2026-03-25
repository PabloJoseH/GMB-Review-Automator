import { getTranslations } from "next-intl/server"
import { XCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * RejectCountStat Component
 * 
 * Overview:
 * Displays the total reject count statistic in a card format.
 * 
 * Functionality:
 * - Receives the count value as a prop from parent component
 * - Displays the count with appropriate formatting and translations
 * - Shows icon and descriptive text
 */
interface RejectCountStatProps {
  count: number
}

export async function RejectCountStat({ count }: RejectCountStatProps) {
  const tStats = await getTranslations("backoffice.system.logs.stats")

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {tStats("reject")}
        </CardTitle>
        <XCircle className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{count}</div>
        <p className="text-xs text-muted-foreground">
          {tStats("rejectedMessages")}
        </p>
      </CardContent>
    </Card>
  )
}
