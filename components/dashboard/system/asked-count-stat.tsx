import { getTranslations } from "next-intl/server"
import { HelpCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * AskedCountStat Component
 * 
 * Overview:
 * Displays the total asked count statistic in a card format.
 * 
 * Functionality:
 * - Receives the count value as a prop from parent component
 * - Displays the count with appropriate formatting and translations
 * - Shows icon and descriptive text
 */
interface AskedCountStatProps {
  count: number
}

export async function AskedCountStat({ count }: AskedCountStatProps) {
  const tStats = await getTranslations("backoffice.system.logs.stats")

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {tStats("asked")}
        </CardTitle>
        <HelpCircle className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{count}</div>
        <p className="text-xs text-muted-foreground">
          {tStats("askedMessages")}
        </p>
      </CardContent>
    </Card>
  )
}
