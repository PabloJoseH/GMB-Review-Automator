import { LocationPromptContextClient } from "./location-prompt-context-client"
import { ExampleReviewsTableServer } from "./example-reviews-table-server"
import type { SerializedLocationWithFullRelations } from "@/lib/prisma-types"

interface LocationPromptContextServerProps {
  location: SerializedLocationWithFullRelations
  locale: string
  searchParams: Promise<{ page?: string }>
}

/**
 * LocationPromptContextServer - Server Component
 * 
 * Passes location data to Client Component for prompt context display
 * and renders example reviews table below.
 * Progressive rendering is handled by Suspense boundary in parent component.
 */
export async function LocationPromptContextServer({ 
  location,
  searchParams
}: LocationPromptContextServerProps) {
  return (
    <div className="space-y-8">
      <LocationPromptContextClient location={location} />
      
      <div className="pt-6 border-t">
        <ExampleReviewsTableServer 
          locationId={location.id}
          searchParams={searchParams}
        />
      </div>
    </div>
  )
}

