import { useEffect, useState } from 'react'

/**
 * useDebounce Hook
 * 
 * Debounces a value by delaying the update until after the specified delay.
 * Useful for search inputs to reduce the number of API calls or expensive operations.
 * 
 * @param value - The value to debounce
 * @param delay - The delay in milliseconds (default: 500ms)
 * @returns The debounced value
 * 
 * @example
 * ```tsx
 * const [searchTerm, setSearchTerm] = useState('')
 * const debouncedSearch = useDebounce(searchTerm, 500)
 * 
 * useEffect(() => {
 *   // Only triggers 500ms after user stops typing
 *   fetchResults(debouncedSearch)
 * }, [debouncedSearch])
 * ```
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    // Set up a timer to update the debounced value after the specified delay
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Clear the timeout if value changes before the delay expires
    // This ensures only the latest value is used
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

