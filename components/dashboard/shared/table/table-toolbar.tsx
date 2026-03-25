"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect, useCallback } from "react"
import { Filter, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useDebounce } from "@/hooks/use-debounce"

interface FilterGroup {
  key: string
  label: string
  options: Array<{
    value: string
    label: string
    icon?: React.ReactNode
  }>
  currentValue?: string
}

interface TableToolbarProps {
  searchPlaceholder?: string
  searchKey?: string
  mode?: "client" | "server"
  onSearchChange?: (value: string) => void
  onStatusChange?: (value: string | null) => void
  currentSearch?: string
  currentStatus?: string
  statusOptions?: Array<{
    value: string
    label: string
    icon?: React.ReactNode
  }>
  filterGroups?: FilterGroup[]
  children?: React.ReactNode
}

export function TableToolbar({
  searchPlaceholder = "Search...",
  searchKey,
  mode = "server",
  onSearchChange,
  onStatusChange,
  currentSearch = "",
  currentStatus,
  statusOptions = [],
  filterGroups = [],
  children,
}: TableToolbarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations("backoffice.shared.table")
  
  // Local state for input - only syncs from URL on mount or external navigation
  const [localSearchTerm, setLocalSearchTerm] = useState(currentSearch)
  
  // Debounced search for server mode - updates URL after user stops typing
  const debouncedSearch = useDebounce(localSearchTerm, 1500)

  // Track URL search param to detect external changes (page reload, browser back/forward)
  const urlSearchParam = searchParams.get("search") || ""

  // Sync from URL only when it changes externally (not from our own debounce)
  // This handles page reload, browser navigation, etc.
  useEffect(() => {
    // If URL has a value different from our local state, it's an external change
    if (urlSearchParam !== localSearchTerm) {
      setLocalSearchTerm(urlSearchParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearchParam]) // Only react to URL changes, not local state changes

  // Update URL when debounced search changes (after user stops typing)
  const updateSearchInURL = useCallback((value: string) => {
    if (mode === "server") {
      const params = new URLSearchParams(searchParams.toString())
      if (value.trim()) {
        params.set("search", value.trim())
        params.set("page", "1")
      } else {
        params.delete("search")
        params.set("page", "1")
      }
      router.push(`?${params.toString()}`)
    }
  }, [mode, searchParams, router])

  // Apply debounced search to URL (only if it differs from current URL param)
  useEffect(() => {
    if (mode === "server" && debouncedSearch !== urlSearchParam) {
      updateSearchInURL(debouncedSearch)
    }
  }, [debouncedSearch, urlSearchParam, mode, updateSearchInURL])

  const handleSearchInput = (value: string) => {
    setLocalSearchTerm(value)
    if (mode === "client" && onSearchChange) {
      onSearchChange(value)
    }
  }

  // Clear search - update immediately (no debounce)
  const handleClearSearch = () => {
    setLocalSearchTerm("")
    if (mode === "server") {
      updateSearchInURL("")
    } else if (onSearchChange) {
      onSearchChange("")
    }
  }

  const handleStatusFilter = (value: string | null) => {
    if (mode === "server") {
      const params = new URLSearchParams(searchParams.toString())
      if (!value || value === "all") {
        params.delete("status")
      } else {
        params.set("status", value)
      }
      params.set("page", "1")

      router.push(`?${params.toString()}`)
    } else if (onStatusChange) {
      onStatusChange(value)
    }
  }

  const handleFilterChange = (filterKey: string, value: string | null) => {
    if (mode === "server") {
      const params = new URLSearchParams(searchParams.toString())
      if (!value || value === "all") {
        params.delete(filterKey)
      } else {
        params.set(filterKey, value)
      }
      params.set("page", "1")

      router.push(`?${params.toString()}`)
    }
  }

  const handleClearFilters = () => {
    if (mode === "server") {
      const params = new URLSearchParams(searchParams.toString())
      params.delete("status")
      params.delete("search")
      // Clear all filter groups
      filterGroups.forEach(group => {
        params.delete(group.key)
      })
      params.set("page", "1")
      setLocalSearchTerm("")

      router.push(`?${params.toString()}`)
    } else {
      setLocalSearchTerm("")
      if (onSearchChange) onSearchChange("")
      if (onStatusChange) onStatusChange(null)
    }
  }
  
  const hasActiveFiltersCheck = !!currentStatus || !!localSearchTerm || filterGroups.some(g => g.currentValue)

  return (
    <div className="flex items-center gap-2">
      {/* Status Filter (legacy) */}
      {statusOptions.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant={hasActiveFiltersCheck ? "default" : "outline"} 
              size="icon"
              className={`shrink-0 ${hasActiveFiltersCheck ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""}`}
            >
              <Filter className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="start">
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">{t("status")}</h4>
                <div className="space-y-1">
                  <Button
                    variant={!currentStatus ? "secondary" : "ghost"}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => handleStatusFilter("all")}
                  >
                    {t("all")}
                  </Button>
                  {statusOptions.map((option) => (
                    <Button
                      key={option.value}
                      variant={currentStatus === option.value ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => handleStatusFilter(option.value)}
                    >
                      {option.icon && <span className="mr-2">{option.icon}</span>}
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
              
              {hasActiveFiltersCheck && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleClearFilters}
                >
                  <X className="mr-2 h-4 w-4" />
                  {t("clear")}
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Multi-Filter Support (new) */}
      {filterGroups.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant={hasActiveFiltersCheck ? "default" : "outline"} 
              size="icon"
              className={`shrink-0 ${hasActiveFiltersCheck ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : ""}`}
            >
              <Filter className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start">
            <div className="space-y-4">
              {filterGroups.map((group) => (
                <div key={group.key} className="space-y-2">
                  <h4 className="font-medium text-sm">{group.label}</h4>
                  <div className="space-y-1">
                    <Button
                      variant={!group.currentValue ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => handleFilterChange(group.key, "all")}
                    >
                      {t("all")}
                    </Button>
                    {group.options.map((option) => (
                      <Button
                        key={option.value}
                        variant={group.currentValue === option.value ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => handleFilterChange(group.key, option.value)}
                      >
                        {option.icon && <span className="mr-2">{option.icon}</span>}
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              
              {hasActiveFiltersCheck && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleClearFilters}
                >
                  <X className="mr-2 h-4 w-4" />
                  {t("clear")}
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Search Input */}
      {searchKey && (
        <div className="relative flex-1">
          <Input
            placeholder={searchPlaceholder}
            value={localSearchTerm}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="pr-10"
          />
          {/* Clear (X) button */}
          {localSearchTerm && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={handleClearSearch}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {/* Additional Actions */}
      {children}
    </div>
  )
}
