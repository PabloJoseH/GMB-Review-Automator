"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Users,
  Building2,
  MapPin,
  Settings,
  Activity,
  MessageCircle,
  MessageSquare,
  Link2,
  Star,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { NavMain } from "@/components/dashboard/shared/nav-main"
import { NavUser } from "@/components/dashboard/shared/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { APP_CONSTANTS } from "@/lib/constants"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  userData?: {
    displayName: string
    email: string
  } | null
}

export function AppSidebar({ userData, ...props }: AppSidebarProps) {
  const t = useTranslations("backoffice.nav")

  const data = {
    navMain: [
      {
        title: t("dashboard"),
        url: "/backoffice",
        icon: LayoutDashboard,
      },
      {
        title: t("conversations"),
        url: "/backoffice/conversations",
        icon: MessageSquare,
      },
      {
        title: t("users"),
        url: "/backoffice/users",
        icon: Users,
      },
      {
        title: t("organizations"),
        url: "/backoffice/organizations",
        icon: Building2,
      },
      {
        title: t("locations"),
        url: "/backoffice/locations",
        icon: MapPin,
      },
      {
        title: t("connections"),
        url: "/backoffice/connections",
        icon: Link2,
      },
      {
        title: t("reviews"),
        url: "/backoffice/reviews",
        icon: Star,
      },
    ],
    navAdmin: [
      {
        title: t("settings"),
        url: "/backoffice/settings",
        icon: Settings,
      },
      {
        title: t("system"),
        url: "/backoffice/system",
        icon: Activity,
      },
    ],
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="cursor-default hover:bg-transparent">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                  <MessageCircle className="h-4 w-4 text-white" />
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{APP_CONSTANTS.brand.companyName}</span>
                <span className="truncate text-xs text-muted-foreground">Backoffice</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <div className="mt-auto">
          <NavMain items={data.navAdmin} label={t("admin")} />
        </div>
      </SidebarContent>
      <SidebarFooter>
        <NavUser 
          displayName={userData?.displayName}
          email={userData?.email}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
