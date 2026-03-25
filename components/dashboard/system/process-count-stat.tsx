import { getTranslations } from "next-intl/server"
import { CheckCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * ProcessCountStat Component
 * 
 * Overview:
 * Displays the total process count statistic in a card format.
 * 
 * Functionality:
 * - Receives the count value as a prop from parent component
 * - Displays the count with appropriate formatting and translations
 * - Shows icon and descriptive text
 */
interface ProcessCountStatProps {
  count: number
}

export async function ProcessCountStat({ count }: ProcessCountStatProps) {
  const tStats = await getTranslations("backoffice.system.logs.stats")

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {tStats("process")}
        </CardTitle>
        <CheckCircle className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{count}</div>
        <p className="text-xs text-muted-foreground">
          {tStats("processedMessages")}
        </p>
      </CardContent>
    </Card>
  )
}
