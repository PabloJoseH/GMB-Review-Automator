"use client"

import { useTranslations } from "next-intl"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { organizations } from "@/app/generated/prisma"

interface OrganizationTabsProps {
  organization: organizations
}

export function OrganizationTabs({ organization }: OrganizationTabsProps) {
  const t = useTranslations("backoffice.organizations")

  return (
    <Tabs defaultValue="info" className="w-full">
      <TabsList>
        <TabsTrigger value="info">{t("detail.tabs.info")}</TabsTrigger>
        <TabsTrigger value="users">{t("detail.tabs.users")}</TabsTrigger>
        <TabsTrigger value="locations">{t("detail.tabs.locations")}</TabsTrigger>
        <TabsTrigger value="subscription">{t("detail.tabs.subscription")}</TabsTrigger>
      </TabsList>

      <TabsContent value="info" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.info.basicInfo")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("detail.info.businessName")}</p>
                <p className="text-sm">{organization.business_name || "—"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("detail.info.businessId")}</p>
                <p className="text-sm">{organization.business_id || "—"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("detail.info.email")}</p>
                <p className="text-sm">{organization.email || "—"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("detail.info.phone")}</p>
                <p className="text-sm">{organization.primary_phone || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm font-medium text-muted-foreground">{t("detail.info.address")}</p>
                <p className="text-sm">{organization.business_address || "—"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("detail.info.clerkOrgId")}</p>
                <p className="text-xs font-mono">{organization.organization_clerk_id || "—"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("detail.info.createdAt")}</p>
                <p className="text-sm">
                  {organization.created_at ? new Date(organization.created_at).toLocaleDateString('es-ES') : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="users" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.tabs.users")}</CardTitle>
            <CardDescription>
              Users associated with this organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* TODO: Implement users list using getUsersByOrganizationId action */}
            <p className="text-sm text-muted-foreground">
              Users list will be displayed here
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="locations" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.tabs.locations")}</CardTitle>
            <CardDescription>
              GMB locations managed by this organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* TODO: Implement locations list using findLocationByUserId action */}
            <p className="text-sm text-muted-foreground">
              Locations list will be displayed here
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="subscription" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.tabs.subscription")}</CardTitle>
            <CardDescription>
              Subscription and billing information
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* TODO: Implement subscription details using findSubscriptionByOrganizationId action */}
            <p className="text-sm text-muted-foreground">
              Subscription details will be displayed here
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

