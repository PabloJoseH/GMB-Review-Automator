"use client"

import { useSearchParams, usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface LocationDetailTabsProps {
  defaultTab: "info" | "promptContext" | "proposedResponses"
  children: React.ReactNode
}

const VALID_TABS = ["info", "promptContext", "proposedResponses"] as const
type ValidTab = typeof VALID_TABS[number]

/**
 * LocationDetailTabs - Client Component for URL-synchronized tabs
 * 
 * Uses hybrid navigation: router.push() when page param exists, replaceState() otherwise.
 */
export function LocationDetailTabs({ defaultTab, children }: LocationDetailTabsProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations("backoffice.locations")

  // Get initial tab from URL or use default from server
  const initialUrlTab = searchParams.get("tab")
  const initialTab = initialUrlTab && VALID_TABS.includes(initialUrlTab as ValidTab)
    ? (initialUrlTab as ValidTab)
    : defaultTab

  // State for active tab - syncs with URL
  const [currentTab, setCurrentTab] = useState<ValidTab>(initialTab)

  // Handle tab change: update state and URL
  const handleTabChange = (value: string) => {
    const newTab = value as ValidTab
    setCurrentTab(newTab)

    // Build new URL with updated tab param
    const params = new URLSearchParams(window.location.search)
    
    // Check if there was a page param before we delete it
    const hadPage = params.has("page")
    
    if (newTab === "info") {
      params.delete("tab")
    } else {
      params.set("tab", newTab)
    }
    
    // Reset page param when changing tabs
    params.delete("page")
    
    const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`
    
    if (hadPage) {
      router.push(newUrl)
    } else {
      window.history.replaceState(null, '', newUrl)
    }
  }

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="info">{t("detail.tabs.info")}</TabsTrigger>
        <TabsTrigger value="promptContext">{t("detail.tabs.promptContext")}</TabsTrigger>
        <TabsTrigger value="proposedResponses">{t("detail.tabs.proposedResponses")}</TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  )
}

