import { ArrowLeft, Building2 } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { notFound } from "next/navigation"
import { getOrganizationById } from "@/server/actions/supabase/organizations.action"
import { createLogger } from "@/lib/logger"
import type { Organization } from "@/lib/prisma-types"

const logger = createLogger('ORGANIZATION_DETAIL_HEADER')

interface OrganizationDetailHeaderProps {
  params: Promise<{ id: string }>
}

/**
 * Server component that fetches and displays organization header information.
 * 
 * Fetches organization data by ID (lightweight query, no relations) and renders
 * organization name, email, and navigation controls. Must be wrapped in Suspense boundary.
 */
export async function OrganizationDetailHeader({ params }: OrganizationDetailHeaderProps) {
  const { id } = await params
  const result = await getOrganizationById(id)
  
  if (!result.success || !result.data) {
    logger.error('Organization not found', null, { organizationId: id })
    notFound()
  }
  
  const organization = result.data as Organization
  const displayName = organization.business_name || organization.email || organization.business_id || "Unnamed Organization"
  
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/backoffice/organizations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-[var(--active)]/10 p-2">
            <Building2 className="h-6 w-6 text-[var(--active)]" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{displayName}</h1>
            {organization.email && (
              <p className="text-sm text-muted-foreground">{organization.email}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

