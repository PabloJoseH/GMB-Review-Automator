/**
 * Utility Functions Library
 * 
 * Provides common utility functions for the application including:
 * - CSS class name merging (cn)
 * - Date and time formatting (formatRelativeTime, formatDate)
 * - Category formatting (formatCategory)
 * - Address formatting and parsing (formatAddress, parseBusinessAddress)
 * - Location serialization (serializeDecimalLocation)
 * - Currency formatting (formatCurrency)
 * - Country name formatting (formatCountryName)
 * - String preview for logging (previewString)
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date to relative time (e.g., "just now", "5 mins ago", "2 hours ago", "3 days ago")
 * Supports internationalization via translation function
 * 
 * @param date - Date object, string, or null
 * @param t - Translation function from next-intl (e.g., useTranslations("common.time"))
 * @param now - Optional Date object to use as "now" reference. If not provided, uses current time.
 *              This is useful for preventing hydration mismatches by using the same "now" value
 *              on both server and client.
 * @returns Formatted relative time string or "—" if date is null
 */
export function formatRelativeTime(
  date: Date | string | null | undefined,
  t: (key: string, values?: Record<string, number>) => string,
  now?: Date
): string {
  if (!date) return "—"
  
  const nowDate = now || new Date()
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const diffMs = nowDate.getTime() - dateObj.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) {
    return t("justNow")
  } else if (diffMins < 60) {
    return t("minutesAgo", { count: diffMins })
  } else if (diffHours < 24) {
    return t("hoursAgo", { count: diffHours })
  } else {
    return t("daysAgo", { count: diffDays })
  }
}

/**
 * Format a date to localized string
 * Returns formatted date with date and time or date only
 * 
 * @param date - Date object, string, or null
 * @param options - Formatting options
 * @param options.locale - Locale string (default: 'es-ES')
 * @param options.includeTime - Whether to include time (default: false)
 * @param options.dateStyle - Date style: 'short', 'medium', 'long', 'full' (default: undefined for custom format)
 * @returns Formatted date string or "—" if date is null
 * 
 * @example
 * formatDate(new Date()) // "31 ene 2025"
 * formatDate(new Date(), { includeTime: true }) // "31 ene 2025, 15:30"
 * formatDate(new Date(), { locale: 'en-US' }) // "Jan 31, 2025"
 */
export function formatDate(
  date: Date | string | null | undefined,
  options?: {
    locale?: string
    includeTime?: boolean
    dateStyle?: 'short' | 'medium' | 'long' | 'full'
  }
): string {
  if (!date) return "—"
  
  const { locale = 'es-ES', includeTime = false, dateStyle } = options || {}
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  if (dateStyle) {
    return dateObj.toLocaleDateString(locale, { dateStyle })
  }
  
  if (includeTime) {
    return dateObj.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  return dateObj.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/**
 * Format a Google category string to a readable format
 * Removes 'gcid:' prefix and replaces underscores with spaces
 * Capitalizes words for better readability
 * 
 * @param category - Category string (e.g., "gcid:mexican_restaurant" or "italian_restaurant")
 * @returns Formatted category string (e.g., "Mexican Restaurant" or "Italian Restaurant")
 * 
 * @example
 * formatCategory("gcid:mexican_restaurant") // "Mexican Restaurant"
 * formatCategory("italian_restaurant") // "Italian Restaurant"
 * formatCategory(null) // "—"
 */
export function formatCategory(category: string | null): string {
  if (!category) return "—"
  
  // Remove gcid: prefix if present
  let formatted = category.includes('gcid:') 
    ? category.split('gcid:')[1] || category 
    : category
  
  // Replace underscores with spaces
  formatted = formatted.replace(/_/g, ' ')
  
  // Capitalize first letter of each word
  formatted = formatted
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  
  return formatted
}

/**
 * Format location address from separate fields
 * Combines address_line1, city, region, and postal_code into a readable format
 * 
 * @param address - Address fields object
 * @param address.address_line1 - Street address
 * @param address.city - City name
 * @param address.region - Region/state name
 * @param address.postal_code - Postal code
 * @returns Formatted address string or "—" if no address fields
 * 
 * @example
 * formatAddress({ address_line1: "123 Main St", city: "Madrid", region: "Madrid", postal_code: "28001" })
 * // "123 Main St, Madrid, Madrid 28001"
 */
export function formatAddress(address: {
  address_line1?: string | null
  city?: string | null
  region?: string | null
  postal_code?: string | null
}): string {
  if (!address.address_line1 && !address.city && !address.region && !address.postal_code) {
    return "—"
  }

  const parts: string[] = []

  if (address.address_line1) {
    parts.push(address.address_line1)
  }

  if (address.city || address.region || address.postal_code) {
    const locationParts: string[] = []
    if (address.city) locationParts.push(address.city)
    if (address.region && address.region !== address.city) locationParts.push(address.region)
    
    let locationStr = locationParts.join(", ")
    if (address.postal_code) {
      locationStr = locationStr ? `${locationStr} ${address.postal_code}` : address.postal_code
    }
    
    if (locationStr) {
      parts.push(locationStr)
    }
  }

  return parts.join(", ")
}

/**
 * Parsed address interface
 * Represents structured address components parsed from concatenated string format
 */
export interface ParsedAddress {
  street: string | null
  city: string | null
  state: string | null
  country: string | null
  postal_code: string | null
}

/**
 * Build business address from individual address fields
 * Creates concatenated string format that parseBusinessAddress can parse
 * Format: "street, city, state, country postalCode"
 * 
 * @param fields - Individual address components
 * @returns Concatenated address string or null if insufficient data
 * 
 * @example
 * buildBusinessAddress({ 
 *   first_line_of_address: "123 Main St", 
 *   city: "Madrid", 
 *   region: "Madrid", 
 *   country: "Spain", 
 *   zip_code: "28001" 
 * })
 * // "123 Main St, Madrid, Madrid, Spain 28001"
 */
export function buildBusinessAddress(fields: {
  first_line_of_address?: string | null
  city?: string | null
  region?: string | null
  zip_code?: string | null
  country?: string | null
}): string | null {
  const parts: string[] = []
  
  // Street address (required for valid format)
  if (fields.first_line_of_address) {
    parts.push(fields.first_line_of_address.trim())
  } else {
    return null // Need at least street address
  }
  
  // City (required for parseBusinessAddress format)
  if (fields.city) {
    parts.push(fields.city.trim())
  } else {
    return null // Need city for valid format
  }
  
  // State/Region (required for parseBusinessAddress format)
  if (fields.region) {
    parts.push(fields.region.trim())
  } else {
    return null // Need region for valid format
  }
  
  // Country and postal code (last part: "country postalCode")
  const countryPart: string[] = []
  if (fields.country) {
    countryPart.push(fields.country.trim())
  }
  if (fields.zip_code) {
    countryPart.push(fields.zip_code.trim())
  }
  
  if (countryPart.length > 0) {
    parts.push(countryPart.join(' '))
  } else {
    return null // Need country for valid format
  }
  
  // Need at least 4 parts for parseBusinessAddress to work
  if (parts.length < 4) {
    return null
  }
  
  return parts.join(', ')
}

/**
 * Parse business address from concatenated string format
 * Parses address string in format: "address, city, state, country postalCode"
 * into structured components for use in forms and API calls
 * 
 * @param businessAddress - The concatenated address string
 * @returns Parsed address components or null if parsing fails
 * 
 * @example
 * parseBusinessAddress("123 Main St, Madrid, Madrid, Spain 28001")
 * // { street: "123 Main St", city: "Madrid", state: "Madrid", country: "Spain", postal_code: "28001" }
 */
export function parseBusinessAddress(businessAddress: string | null | undefined): ParsedAddress | null {
  if (!businessAddress || typeof businessAddress !== 'string') {
    return null
  }

  const trimmed = businessAddress.trim()
  if (!trimmed) {
    return null
  }

  // Split by commas to get main parts
  const parts = trimmed.split(',').map(part => part.trim()).filter(Boolean)
  
  if (parts.length < 4) {
    // Not enough parts, return null
    return null
  }

  // Last part contains: "country postalCode"
  // Second to last: state
  // Third to last: city
  // Everything before: street address (may contain commas)
  const lastPart = parts[parts.length - 1] || ''
  const state = parts[parts.length - 2] || null
  const city = parts[parts.length - 3] || null
  const street = parts.slice(0, -3).join(', ') || null
  
  // Extract country and postal code from last part
  // Try to match postal code at the end (alphanumeric with spaces/hyphens)
  // Postal codes are typically at the end: "ES 28001" or "United States 12345"
  const postalCodeMatch = lastPart.match(/\s+([A-Z0-9\s\-]{3,})$/i)
  
  let country: string | null = null
  let postal_code: string | null = null
  
  if (postalCodeMatch) {
    postal_code = postalCodeMatch[1]?.trim() || null
    country = lastPart.substring(0, postalCodeMatch.index)?.trim() || null
  } else {
    // No postal code found, entire last part is country
    country = lastPart || null
  }

  return {
    street,
    city,
    state,
    country,
    postal_code
  }
}

/**
 * Serialize Prisma Decimal objects to numbers for Client Components
 * 
 * Prisma Decimal objects cannot be passed to Client Components directly.
 * This helper converts Decimal lat/lng fields to numbers, handling null/undefined values.
 * 
 * @param location - Location object with potential Decimal lat/lng fields
 * @returns Location object with lat/lng as numbers or null
 * 
 * @example
 * serializeDecimalLocation({ id: "1", lat: Decimal("40.4168"), lng: Decimal("-3.7038") })
 * // { id: "1", lat: 40.4168, lng: -3.7038 }
 */
export function serializeDecimalLocation<T extends { lat?: unknown; lng?: unknown }>(
  location: T
): Omit<T, 'lat' | 'lng'> & { lat: number | null; lng: number | null } {
  return {
    ...location,
    lat: location.lat !== undefined && location.lat !== null ? Number(location.lat) : null,
    lng: location.lng !== undefined && location.lng !== null ? Number(location.lng) : null,
  }
}

/**
 * Format a currency amount to localized string
 * Converts Decimal, number, or string to formatted currency
 * 
 * @param amount - Amount as Decimal, number, or string
 * @param currency - Currency code (default: 'EUR')
 * @param locale - Locale string (default: 'es-ES')
 * @returns Formatted currency string
 * 
 * @example
 * formatCurrency(1234.56, 'EUR') // "1.234,56 €"
 * formatCurrency("99.99", 'USD', 'en-US') // "$99.99"
 * formatCurrency(Decimal("50.00"), 'GBP', 'en-GB') // "£50.00"
 */
export function formatCurrency(
  amount: unknown,
  currency: string = 'EUR',
  locale: string = 'es-ES'
): string {
  if (amount === null || amount === undefined) return "—"
  
  // Convert Decimal, string, or number to number
  const numAmount = typeof amount === 'string' 
    ? parseFloat(amount) 
    : typeof amount === 'object' && amount !== null && 'toNumber' in amount
      ? (amount as { toNumber: () => number }).toNumber()
      : Number(amount)
  
  if (isNaN(numAmount)) return "—"
  
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency
  }).format(numAmount)
}

/**
 * Format ISO country code to localized country name
 * Uses native Intl.DisplayNames API (best practice for server and client components)
 * 
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., "ES", "US", "COL")
 * @param locale - Locale string (default: 'es'). Use 'es' for Spanish, 'en' for English
 * @returns Localized country name or the code if not found
 * 
 * @example
 * formatCountryName("ES", "es") // "España"
 * formatCountryName("US", "en") // "United States"
 * formatCountryName("COL", "es") // "Colombia"
 */
export function formatCountryName(
  countryCode: string | null | undefined,
  locale: string = 'es'
): string {
  if (!countryCode) return "—"
  
  const normalizedCode = countryCode.toUpperCase().trim()
  if (normalizedCode.length !== 2) return countryCode
  
  try {
    // Use native Intl.DisplayNames API - works in both server and client components
    // This is the recommended approach for Next.js 16
    const displayLocale = locale === 'es' ? 'es-ES' : 'en-US'
    const regionNames = new Intl.DisplayNames([displayLocale], { type: 'region' })
    return regionNames.of(normalizedCode) || countryCode
  } catch {
    // If all else fails, return the code
    return countryCode
  }
}

/**
 * Convert payment amount from smallest currency unit to actual currency value
 * Payment APIs (Stripe, etc.) return amounts as integers in the smallest currency unit (cents)
 * 
 * @param paymentAmount - Amount from payment provider (Decimal, number, or string)
 * @returns Actual currency value as number
 * 
 * @example
 * formatPaymentAmount(62935) // 629.35
 * formatPaymentAmount(Decimal("10000")) // 100.00
 * 
 * @deprecated The alias formatPaddleAmount is kept for backward compatibility.
 */
export function formatPaymentAmount(
  paymentAmount: unknown
): number {
  if (paymentAmount === null || paymentAmount === undefined) return 0
  
  const numAmount = typeof paymentAmount === 'string' 
    ? parseFloat(paymentAmount) 
    : typeof paymentAmount === 'object' && paymentAmount !== null && 'toNumber' in paymentAmount
      ? (paymentAmount as { toNumber: () => number }).toNumber()
      : Number(paymentAmount)
  
  if (isNaN(numAmount)) return 0
  
  return numAmount / 100
}

/**
 * @deprecated Use formatPaymentAmount instead. This alias is kept for backward compatibility.
 */
export const formatPaddleAmount = formatPaymentAmount

/**
 * Format number with Spanish locale (thousand separator with dot, decimal separator with comma)
 * 
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 2)
 * @param locale - Locale string (default: 'es-ES')
 * @returns Formatted number string
 * 
 * @example
 * formatNumber(1234.56) // "1.234,56"
 * formatNumber(1234.567, 2) // "1.234,57"
 * formatNumber(1000, 0) // "1.000"
 */
export function formatNumber(
  value: number,
  decimals: number = 2,
  locale: string = 'es-ES'
): string {
  if (isNaN(value)) return "—"
  
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value)
}

/**
 * Creates a preview of a string for logging purposes
 * Returns the first N characters followed by '...' if the string is longer
 * 
 * @param str - String to preview (can be null or undefined)
 * @param maxLength - Maximum length of preview (default: 10)
 * @returns Preview string or empty string if input is null/undefined
 * 
 * @example
 * previewString('abcdefghijklmnop', 10) // "abcdefghij..."
 * previewString('abc', 10) // "abc"
 * previewString(null, 10) // ""
 */
export function previewString(str: string | null | undefined, maxLength: number = 10): string {
  if (!str) return ''
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + '...'
}
