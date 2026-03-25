import { TabsContent } from "@/components/ui/tabs"
import { LocationDetailTabs } from "@/components/dashboard/locations/single/location-detail-tabs"
import { LocationInfoSection } from "@/components/dashboard/locations/single/location-info-section"
import { LocationProposedResponsesServer } from "@/components/dashboard/locations/single/location-proposed-responses-server"
import { LocationPromptContextServer } from "@/components/dashboard/locations/single/location-prompt-context-server"
import type { SerializedLocationWithFullRelations } from "@/lib/prisma-types"

function getValidTab(tabParam: string | undefined): "info" | "promptContext" | "proposedResponses" {
  const validTabs = ["info", "promptContext", "proposedResponses"] as const
  return tabParam && validTabs.includes(tabParam as typeof validTabs[number])
    ? (tabParam as typeof validTabs[number])
    : "info"
}

function getValidPage(pageParam: string | undefined): number {
  if (!pageParam) return 1
  const page = Number(pageParam)
  return isNaN(page) || page < 1 ? 1 : page
}

interface LocationDetailTabsServerProps {
  location: SerializedLocationWithFullRelations
  params: Promise<{ locale: string; id: string }>
  searchParams: Promise<{
    tab?: string
    page?: string
    search?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }>
}

/**
 * Server component that renders tabbed content for location details.
 * 
 * Receives location data as prop to avoid redundant queries.
 * Validates URL parameters (tab, page) and renders tabbed interface with
 * location information, reviews, pending reviews, and prompt context.
 * Uses React keys on paginated tabs to force re-render on page changes.
 */
export async function LocationDetailTabsServer({ 
  location,
  params, 
  searchParams 
}: LocationDetailTabsServerProps) {
  const { locale } = await params
  const resolvedSearchParams = await searchParams
  const defaultTab = getValidTab(resolvedSearchParams.tab)
  
  const proposedResponsesPage = defaultTab === "proposedResponses" 
    ? getValidPage(resolvedSearchParams.page).toString() 
    : undefined

  const proposedResponsesKey = proposedResponsesPage ? `proposedResponses-${proposedResponsesPage}` : "proposedResponses-1"

  return (
    <LocationDetailTabs defaultTab={defaultTab}>
      <TabsContent value="info" className="space-y-6 mt-6 pb-8">
        <LocationInfoSection location={location} locale={locale} />
      </TabsContent>

      <TabsContent value="promptContext" className="space-y-6 mt-6">
        <LocationPromptContextServer 
          location={location} 
          locale={locale}
          searchParams={searchParams}
        />
      </TabsContent>

      <TabsContent value="proposedResponses" className="space-y-6 mt-6">
        <div key={defaultTab === "proposedResponses" ? proposedResponsesKey : undefined}>
          <LocationProposedResponsesServer 
            location={{ id: location.id }}
            searchParams={searchParams}
            locale={locale}
          />
        </div>
      </TabsContent>
    </LocationDetailTabs>
  )
}

