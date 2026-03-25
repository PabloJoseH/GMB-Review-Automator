"use client"

/**
 * Overview: WhatsApp-style session message sheet with realtime updates and fallback polling.
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, User, Bot, ChevronUp, BadgeCheck, Wrench, Wifi, WifiOff, Loader2, AlertCircle } from "lucide-react"
import { WhatsAppMessageMenu } from "@/components/dashboard/shared/whatsapp-message-menu"
import { getSessionMessagesPaginated, type MessageWithSession, setSessionAgentManaged } from "@/server/actions/supabase/sessions.action"
import { createEmployeeMessage } from "@/server/actions/supabase/messages.action"
import { sendTextMessageAction } from "@/server/actions/whatsapp/sendMessage.action"
import { createClient, type RealtimeChannel, type RealtimePostgresChangesPayload, type SupabaseClient } from "@supabase/supabase-js"
import { createLogger } from "@/lib/logger"

const logger = createLogger('SESSION-MESSAGES-SHEET')

interface SessionMessagesSheetProps {
  sessionId: string
  children: React.ReactNode
}

interface SessionData {
  id: string
  user_id: string
  conversation_id: string | null
  agent_managed: boolean
  active: boolean
  created_at: Date | null
  updated_at: Date | null
  wa_id: string | null
}

/**
 * InputAreaSkeleton - Loading skeleton for the input area
 */
function InputAreaSkeleton() {
  return (
    <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Skeleton className="h-[40px] w-full rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-12 rounded" />
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-4 w-3/4 mx-auto mt-2 rounded" />
    </div>
  )
}

/**
 * SessionMessagesSheet - Client Component
 * 
 * Displays WhatsApp-style conversation messages in a side sheet.
 * 
 * Architecture:
 * - Client Component: Handles user interactions and state
 * - Uses Sheet component for side panel display
 * - Fetches messages via paginated server action
 * - Listens to Supabase Realtime feed for live updates
 * - WhatsApp-style message bubbles (user left, agent right)
 * 
 * Features:
 * - Side sheet with conversation history
 * - WhatsApp-style scroll behavior (start at bottom, scroll up)
 * - Paginated message loading (20 messages per page)
 * - Load more button when scrolling to top
 * - Message bubbles styled like WhatsApp
 * - User messages on left (white), agent messages on right (primary)
 * - Scrollable conversation area
 * - Session metadata display
 * - Loading and error states
 * 
 * Design:
 * - Sheet component from shadcn/ui
 * - Custom message bubble styling
 * - Responsive design
 * - Proper spacing and typography
 */
export function SessionMessagesSheet({ sessionId, children }: SessionMessagesSheetProps) {
  const t = useTranslations("backoffice.users.detail.sessions.conversation")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<MessageWithSession[]>([])
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<"idle" | "connecting" | "connected" | "fallback">("idle")
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [inputValue, setInputValue] = useState("")
  const agentManaged = sessionData?.agent_managed ?? true
  const isActive = sessionData?.active ?? false
  const canWrite = isActive && !agentManaged
  
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollHeightRef = useRef<number>(0)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const supabaseClientRef = useRef<SupabaseClient | null>(null)
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const fallbackPollingRef = useRef<number | null>(null)

  const fetchMessages = useCallback(async (page: number = 1, reset: boolean = false) => {
    if (reset) {
      setLoading(true)
      setCurrentPage(1)
    } else {
      setLoadingMore(true)
    }
    
    setError(null)
    
    try {
      const result = await getSessionMessagesPaginated(sessionId, page, 20)
      
      if (result.success && result.data) {
        if (reset) {
          setMessages(result.data.messages)
          setCurrentPage(1)
        } else {
          // Prepend older messages to the beginning
          setMessages(prev => [...result.data!.messages, ...prev])
        }
        
        setSessionData(result.data.session)
        setHasMore(result.data.pagination.hasMore)
        setCurrentPage(page)
      } else {
        setError(result.error || 'Failed to load messages')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [sessionId])

  const stopFallbackPolling = useCallback(() => {
    if (fallbackPollingRef.current !== null && typeof window !== "undefined") {
      window.clearInterval(fallbackPollingRef.current)
      fallbackPollingRef.current = null
    }
  }, [])

  const startFallbackPolling = useCallback(() => {
    if (fallbackPollingRef.current || typeof window === "undefined") {
      return
    }

    fallbackPollingRef.current = window.setInterval(() => {
      fetchMessages(1, true)
    }, 10000)

    setRealtimeStatus("fallback")
  }, [fetchMessages])

  // Fetch messages when sheet opens
  useEffect(() => {
    if (open && sessionId) {
      fetchMessages(1, true) // Reset to page 1
    }
  }, [open, sessionId, fetchMessages])

  // Scroll to bottom when messages load (only on initial load)
  useLayoutEffect(() => {
    if (messages.length > 0 && messagesEndRef.current && currentPage === 1) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, currentPage])

  // Handle scroll position when loading more messages
  useLayoutEffect(() => {
    if (scrollHeightRef.current > 0 && scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollElement) {
        const newHeight = scrollElement.scrollHeight
        const heightDifference = newHeight - scrollHeightRef.current
        scrollElement.scrollTop = heightDifference
        scrollHeightRef.current = 0 // Reset
      }
    }
  }, [messages])

  // Subscribe to Supabase Realtime feed for session messages with polling fallback
  useEffect(() => {
    if (!open) {
      setRealtimeStatus("idle")
      stopFallbackPolling()
      if (supabaseClientRef.current && realtimeChannelRef.current) {
        supabaseClientRef.current.removeChannel(realtimeChannelRef.current)
      }
      realtimeChannelRef.current = null
      return
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      logger.warn("Supabase realtime configuration is missing. Falling back to polling.")
      if (supabaseClientRef.current && realtimeChannelRef.current) {
        supabaseClientRef.current.removeChannel(realtimeChannelRef.current)
        realtimeChannelRef.current = null
      }
      startFallbackPolling()
      setRealtimeStatus("fallback")
      return () => {
        stopFallbackPolling()
      }
    }

    if (!supabaseClientRef.current) {
      supabaseClientRef.current = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false
        }
      })
    }

    const supabase = supabaseClientRef.current
    if (!supabase) {
      return
    }

    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current)
      realtimeChannelRef.current = null
    }

    const handleMessageChange = (payload: RealtimePostgresChangesPayload<SupabaseMessageRow>) => {
      const rawRow = payload.new

      if (!rawRow || typeof rawRow !== "object" || !("session_id" in rawRow)) {
        return
      }

      const row = rawRow as SupabaseMessageRow

      if (row.session_id !== sessionId) {
        return
      }

      const mappedMessage = mapSupabaseRowToMessage(row)

      setMessages(prevMessages => {
        const existingIndex = prevMessages.findIndex(message => message.id === mappedMessage.id)

        if (existingIndex !== -1) {
          const nextMessages = [...prevMessages]
          nextMessages[existingIndex] = {
            ...nextMessages[existingIndex],
            ...mappedMessage
          }
          return sortMessagesChronologically(nextMessages)
        }

        return sortMessagesChronologically([...prevMessages, mappedMessage])
      })
    }

    setRealtimeStatus("connecting")

    const channel = supabase
      .channel(`session-messages-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `session_id=eq.${sessionId}`
        },
        handleMessageChange
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `session_id=eq.${sessionId}`
        },
        handleMessageChange
      )

    channel.subscribe(status => {
      if (status === "SUBSCRIBED") {
        stopFallbackPolling()
        setRealtimeStatus("connected")
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (process.env.NODE_ENV !== "production") {
          logger.error(`Supabase realtime channel status: ${status}`)
        }
        startFallbackPolling()
      }
    })

    realtimeChannelRef.current = channel

    return () => {
      stopFallbackPolling()
      if (supabaseClientRef.current) {
        supabaseClientRef.current.removeChannel(channel)
      }
      if (realtimeChannelRef.current === channel) {
        realtimeChannelRef.current = null
      }
      setRealtimeStatus("idle")
    }
  }, [open, sessionId, startFallbackPolling, stopFallbackPolling])

  const loadMoreMessages = () => {
    if (hasMore && !loadingMore) {
      // Store current scroll height before loading more messages
      if (scrollAreaRef.current) {
        const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
        if (scrollElement) {
          scrollHeightRef.current = scrollElement.scrollHeight
        }
      }
      fetchMessages(currentPage + 1, false)
    }
  }

  const formatMessageTime = (date: Date | null) => {
    if (!date) return ""
    
    return new Date(date).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }


  return (
    <Sheet open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen)
      if (!newOpen && open) {
        router.refresh()
      }
    }}>
      <SheetContent className="!w-full sm:!w-[33vw] sm:!max-w-[33vw] !p-0 border-0 h-full flex flex-col overflow-x-hidden">
        <SheetHeader className="px-6 py-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b pr-12">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <SheetTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {t("title")}
              </SheetTitle>
              <div className="mt-2">
                {realtimeStatus === "connecting" && (
                  <Badge variant="outline" className="flex items-center gap-1 w-fit">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("realtimeStatus.connecting")}
                  </Badge>
                )}
                {realtimeStatus === "connected" && (
                  <Badge variant="outline" className="flex items-center gap-1 w-fit bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                    <Wifi className="h-3 w-3" />
                    {t("realtimeStatus.connected")}
                  </Badge>
                )}
                {realtimeStatus === "fallback" && (
                  <Badge variant="outline" className="flex items-center gap-1 w-fit bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                    <WifiOff className="h-3 w-3" />
                    {t("realtimeStatus.fallback")}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {sessionData && (
                <WhatsAppMessageMenu 
                  userId={sessionData.user_id}
                  disabled={!sessionData.wa_id}
                />
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 px-4 sm:px-6 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700 overflow-hidden w-full">
          {realtimeStatus === "fallback" && !error && (
            <div className="text-xs text-amber-600 dark:text-amber-400 text-center py-2">
              {t("realtimeStatus.fallbackMessage")}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-muted-foreground">
                {t("loading")}
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="text-sm text-destructive">
                {error}
              </div>
                  <Button variant="outline" onClick={() => fetchMessages(1, true)}>
                    {t("retry")}
                  </Button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-muted-foreground">
                {t("empty")}
              </div>
            </div>
          ) : (
                <ScrollArea className="h-full w-full" ref={scrollAreaRef}>
                  <div className="space-y-4 pr-4 w-full max-w-full" ref={messagesContainerRef}>
                    {/* Load More Button */}
                    {hasMore && (
                      <div className="flex justify-center py-4">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={loadMoreMessages}
                          disabled={loadingMore}
                          className="flex items-center gap-2"
                        >
                          <ChevronUp className="h-4 w-4" />
                          {loadingMore ? t("loadingMore") : t("loadMore")}
                        </Button>
                      </div>
                    )}
                
                {/* Messages */}
                {messages.map((message) => {
                  if (message.role === 'system') {
                    return (
                      <div
                        key={message.id}
                        className="flex w-full justify-center my-2"
                      >
                        <div className="max-w-[90%] sm:max-w-[80%] min-w-0 rounded-lg px-4 py-2.5 shadow-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
                          <div className="flex items-center gap-2 mb-1.5">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                              {t("system")}
                            </span>
                          </div>
                          <div className="text-sm whitespace-pre-wrap leading-relaxed break-all text-amber-900 dark:text-amber-100">
                            {message.content}
                          </div>
                          <div className="text-xs opacity-70 mt-1.5 text-right text-amber-600 dark:text-amber-400">
                            {formatMessageTime(message.created_at)}
                          </div>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={message.id}
                      className={`flex w-full ${message.role === 'user' ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-[75%] min-w-0 rounded-2xl px-4 py-3 shadow-sm ${
                          message.role === 'user'
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-600'
                            : 'bg-[var(--active)] text-[var(--active-foreground)]'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {message.role === 'user' && (
                            <User className="h-3 w-3 text-slate-500" />
                          )}
                          {message.role === 'agent' && (
                            <Bot className="h-3 w-3 text-[var(--active-foreground)]/70" />
                          )}
                          {message.role === 'employee' && (
                            <BadgeCheck className="h-3 w-3 text-[var(--active-foreground)]/70" />
                          )}
                          {message.role === 'function_call' && (
                            <Wrench className="h-3 w-3 text-[var(--active-foreground)]/70" />
                          )}
                          <span className="text-xs font-medium opacity-70">
                            {message.role === 'user'
                              ? t("user")
                              : message.role === 'agent'
                                ? t("agent")
                                : message.role === 'employee'
                                  ? t("employee")
                                  : t("function")}
                          </span>
                        </div>
                        <div className="text-sm whitespace-pre-wrap leading-relaxed break-all">
                          {message.content}
                        </div>
                        <div className="text-xs opacity-70 mt-2 text-right">
                          {formatMessageTime(message.created_at)}
                        </div>
                      </div>
                    </div>
                  )
                })}
                
                {/* Scroll anchor */}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          )}
        </div>

        {/* WhatsApp-style Input Area */}
        {loading ? (
          <InputAreaSkeleton />
        ) : (
        <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="relative">
                <textarea
                  placeholder={!isActive ? t("archivedPlaceholder") : t("inputPlaceholder")}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  rows={1}
                  style={{ minHeight: '40px', maxHeight: '120px' }}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  disabled={!canWrite}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (canWrite && inputValue.trim().length > 0) {
                        const content = inputValue.trim()
                        setInputValue("")
                        ;(async () => {
                          const res = await createEmployeeMessage(sessionId, content)
                          if (res?.success) {
                            if (sessionData?.wa_id) {
                              await sendTextMessageAction(sessionData.wa_id, content)
                            }

                            if (realtimeStatus === "fallback" || realtimeStatus === "idle") {
                              setMessages(prev => ([
                                ...prev,
                                {
                                  id: res.message_data?.id || '',
                                  session_id: sessionId,
                                  role: 'employee',
                                  content,
                                  position: null,
                                  created_at: new Date(),
                                  updated_at: new Date()
                                } as MessageWithSession
                              ]))
                            }
                          } else {
                            setError(res?.error || 'Failed to send message')
                          }
                        })()
                      }
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("agentLabel")}</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={agentManaged}
                    onChange={async (e) => {
                      const next = e.target.checked
                      setSessionData(prev => prev ? { ...prev, agent_managed: next } : prev)
                      const res = await setSessionAgentManaged(sessionId, next)
                      if (!res?.success) {
                        // revert on error
                        setSessionData(prev => prev ? { ...prev, agent_managed: !next } : prev)
                        setError(res?.error || 'Failed to update session')
                      }
                    }}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[var(--active)]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--active)]"></div>
                </label>
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2 text-center">
            💡 {!isActive ? t("archivedHint") : t("inputHint")}
          </div>
        </div>
        )}
      </SheetContent>
      
      {/* Trigger button */}
      <div onClick={() => setOpen(true)}>
        {children}
      </div>
    </Sheet>
  )
}

interface SupabaseMessageRow {
  id: string
  session_id: string
  role: string
  content: string | null
  position: number | null
  created_at: string | null
  updated_at: string | null
}

/**
 * mapSupabaseRowToMessage - Normalizes realtime payloads into UI message objects.
 */
function mapSupabaseRowToMessage(row: SupabaseMessageRow): MessageWithSession {
  return {
    id: row.id,
    session_id: row.session_id,
    role: row.role as MessageWithSession["role"],
    content: row.content ?? "",
    position: row.position,
    created_at: row.created_at ? new Date(row.created_at) : null,
    updated_at: row.updated_at ? new Date(row.updated_at) : null
  }
}

/**
 * sortMessagesChronologically - Keeps messages ordered by position or timestamp.
 */
function sortMessagesChronologically(messages: MessageWithSession[]): MessageWithSession[] {
  const getComparablePosition = (value: number | null) => (typeof value === "number" ? value : null)
  const getComparableTimestamp = (value: Date | string | null) => {
    if (!value) return 0
    const dateInstance = value instanceof Date ? value : new Date(value)
    return Number.isNaN(dateInstance.getTime()) ? 0 : dateInstance.getTime()
  }

  return [...messages].sort((a, b) => {
    const aPosition = getComparablePosition(a.position)
    const bPosition = getComparablePosition(b.position)

    if (aPosition !== null && bPosition !== null && aPosition !== bPosition) {
      return aPosition - bPosition
    }

    const aTimestamp = getComparableTimestamp(a.created_at)
    const bTimestamp = getComparableTimestamp(b.created_at)
    return aTimestamp - bTimestamp
  })
}

