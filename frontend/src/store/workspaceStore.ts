import { create } from 'zustand'
import { supabase } from '../lib/supabase'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

export interface Lead {
  id: string
  user_id: string
  source: string
  title: string
  raw_text: string
  status: string
  created_at: string
}

export interface ItemizedCost {
  description: string
  quantity: number
  unit_price: number
  total_price: number
  category?: 'material' | 'labor' | 'other'
  needs_review?: boolean
}

export interface Quote {
  id: string
  lead_id: string
  user_id: string
  material_cost: number
  labor_cost: number
  total_cost: number
  itemized_breakdown: ItemizedCost[]
  email_draft: string
  status: string
  created_at: string
  quote_number?: string | null
  currency?: string | null
  subtotal?: number | null
  discount_percent?: number | null
  tax_percent?: number | null
  valid_until?: string | null
  customer_name?: string | null
  customer_email?: string | null
  customer_phone?: string | null
  customer_company?: string | null
  review_notes?: string[]
  public_token?: string | null
  sent_at?: string | null
  first_viewed_at?: string | null
  last_viewed_at?: string | null
  view_count?: number | null
  outcome?: 'accepted' | 'declined' | null
  outcome_source?: string | null
  responded_at?: string | null
  customer_comment?: string | null
  delivery?: 'email' | 'manual' | null
  sent_to?: string | null
}

export interface DispatchOptions {
  mode?: 'email' | 'manual'
  confirm_unpriced?: boolean
  include_link?: boolean
}

export interface CustomerSummary {
  key: string
  name: string | null
  email: string | null
  phone: string | null
  company: string | null
  quotes: number
  sent: number
  won: number
  lost: number
  open: number
  quoted_value: number
  won_value: number
  win_rate: number | null
  last_activity: string | null
  currency: string
}

export interface CustomerHistory {
  customer: CustomerSummary
  quotes: {
    id: string
    lead_id: string | null
    quote_number: string | null
    date: string
    status: string
    outcome: string | null
    total: number
    currency: string
    items: { description: string; quantity: number; unit_price: number; total_price: number }[]
  }[]
  price_history: {
    description: string
    prices: { date: string; unit_price: number; quantity: number; quote_number: string | null; outcome: string | null }[]
  }[]
}

export interface MailConnectionStatus {
  providers: Record<string, { configured: boolean; redirect_uri: string }>
  connection: { provider: string; email: string } | null
}

export interface WhatsAppStatus {
  credentials_saved: boolean
  credentials_valid: boolean | null
  credentials_error: string | null
  sender_number: string | null
  webhook_url: string
  webhook_public: boolean
}

export interface AutomationSettings {
  auto_draft_quotes: boolean
  auto_follow_up: boolean
  follow_up_after_days: number
  webhook_url: string | null
  webhook_secret: string | null
}

export interface QuoteAnalytics {
  drafts: number
  sent: number
  viewed: number
  accepted: number
  declined: number
  open: number
  win_rate: number | null
  quoted_value: number
  won_value: number
  open_value: number
  median_response_hours: number | null
  needs_follow_up: string[]
  follow_up_after_days: number
}

// Error thrown by API calls; `code` carries machine-readable reasons such as
// 'unpriced_items' or 'no_mailbox' so the UI can offer the right next step.
export class ApiError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

const toApiError = async (res: Response, fallback: string): Promise<ApiError> => {
  try {
    const data = await res.json()
    const detail = data?.detail
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      return new ApiError(detail.message || fallback, detail.code)
    }
    if (typeof detail === 'string') return new ApiError(detail)
  } catch {
    // non-JSON error body
  }
  return new ApiError(fallback)
}

export interface KbFile {
  id: string
  user_id: string
  filename: string
  file_path: string
  content_type: string
  parsed_content: string
  created_at: string
}

export interface CustomerEmail {
  id: string
  user_id: string
  sender_email: string
  subject: string
  body: string
  status: string // 'unread', 'imported', 'replied'
  created_at: string
}

export interface WhatsAppChat {
  id: string
  user_id: string
  phone_number: string
  customer_name: string
  status: string // 'active_ai', 'human_required'
  created_at: string
}

export interface WhatsAppMessage {
  id: string
  chat_id: string
  sender: string // 'customer', 'system', 'agent'
  text: string
  created_at: string
}

interface WorkspaceState {
  leads: Lead[]
  quotes: Quote[]
  kbFiles: KbFile[]
  emails: CustomerEmail[]
  // null = not checked yet; false = no mailbox connected in settings
  emailConfigured: boolean | null
  whatsappChats: WhatsAppChat[]
  whatsappMessages: WhatsAppMessage[]
  dispatchedQuotes: any[]
  loadingDispatched: boolean
  userProfile: any | null
  teamInfo: {
    company_id: string
    company_name: string
    invite_token: string
    members: Array<{
      id: string
      name: string
      email: string
      role: string
      phone_number?: string
      created_at?: string
    }>
  } | null
  adminUsers: any[]
  systemStatus: any | null
  systemLogs: any[]
  activeLead: Lead | null
  activeQuote: Quote | null
  activeChat: WhatsAppChat | null
  loadingLeads: boolean
  loadingQuotes: boolean
  loadingKb: boolean
  loadingEmails: boolean
  loadingChats: boolean
  loadingMessages: boolean
  aiProcessing: boolean
  error: string | null
  
  // Actions
  fetchLeads: () => Promise<void>
  fetchKbFiles: () => Promise<void>
  fetchQuotes: () => Promise<void>
  setActiveLead: (lead: Lead | null) => Promise<void>
  createLead: (title: string, rawText: string) => Promise<void>
  deleteLead: (leadId: string) => Promise<void>
  uploadKbFile: (file: File) => Promise<void>
  deleteKbFile: (kbId: string) => Promise<void>
  updateKbFileContent: (kbId: string, filename: string, content: string) => Promise<void>
  runAiEngine: (leadId: string) => Promise<void>
  updateQuote: (quoteId: string, updates: Partial<Quote>) => Promise<void>
  dispatchQuote: (quoteId: string, options?: DispatchOptions) => Promise<Quote>
  setQuoteOutcome: (quoteId: string, outcome: 'accepted' | 'declined' | null) => Promise<void>
  quoteAnalytics: QuoteAnalytics | null
  fetchQuoteAnalytics: () => Promise<void>
  fetchDispatchedQuotes: () => Promise<void>
  reimportLead: (leadId: string) => Promise<void>
  fetchProfile: () => Promise<any>
  updateProfile: (profileData: any) => Promise<any>
  completeOnboarding: (onboardingData: any) => Promise<any>
  seedSampleKb: () => Promise<void>
  fetchTeam: () => Promise<any>
  verifyInviteToken: (token: string) => Promise<any>
  acceptTeamInvite: (inviteToken: string, name?: string) => Promise<any>
  changePassword: (currentPassword: string, password: string) => Promise<void>
  automation: AutomationSettings | null
  customers: CustomerSummary[]
  loadingCustomers: boolean
  fetchCustomers: () => Promise<void>
  fetchCustomerHistory: (key: string) => Promise<CustomerHistory | null>
  uploadPartFile: (leadId: string, file: File) => Promise<void>
  mailConnection: MailConnectionStatus | null
  fetchMailConnection: () => Promise<void>
  startMailConnect: (provider: string) => Promise<void>
  disconnectMail: () => Promise<void>
  fetchAutomation: () => Promise<void>
  saveAutomation: (changes: Partial<AutomationSettings>) => Promise<void>
  adminListUsers: () => Promise<any[]>
  adminCreateUser: (data: any) => Promise<void>
  adminUpdateUser: (userId: string, data: any) => Promise<void>
  adminDeleteUser: (userId: string) => Promise<void>
  adminSettings: { base_labor_rate: number; base_material_markup: number } | null
  fetchAdminSettings: () => Promise<any>
  saveAdminSettings: (data: { base_labor_rate: number; base_material_markup: number }) => Promise<any>
  fetchSystemStatus: () => Promise<any>
  fetchSystemLogs: () => Promise<any[]>
  logSystemAction: (source: string, level: string, message: string) => Promise<void>
  
  // New Email & WhatsApp Actions
  fetchEmails: () => Promise<void>
  transferEmail: (emailId: string) => Promise<void>
  replyEmail: (emailId: string, replyBody: string) => Promise<{ sent: boolean; to: string; message: string } | void>
  fetchChats: () => Promise<void>
  setActiveChat: (chat: WhatsAppChat | null) => Promise<void>
  fetchChatMessages: (chatId: string) => Promise<void>
  sendWhatsAppMessage: (chatId: string, text: string) => Promise<{ delivered: boolean; reason: string | null }>
  whatsappStatus: WhatsAppStatus | null
  fetchWhatsAppStatus: () => Promise<void>
  toggleTakeover: (chatId: string, statusMode: 'active_ai' | 'human_required') => Promise<void>
  exportWhatsAppLeads: () => Promise<void>
  notifications: Array<{ id: string; title: string; description: string; type: 'email' | 'whatsapp'; created_at: string; read: boolean }>
  addNotification: (notification: any) => void
  markNotificationsAsRead: () => void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  // Helper to fetch Auth headers
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error("No active authenticated session")
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  }

  return {
    leads: [],
    quotes: [],
    kbFiles: [],
    emails: [],
    emailConfigured: null,
    whatsappChats: [],
    whatsappMessages: [],
    dispatchedQuotes: [],
    loadingDispatched: false,
    quoteAnalytics: null,
    automation: null,
    whatsappStatus: null,
    customers: [],
    loadingCustomers: false,
    mailConnection: null,
    userProfile: null,
    teamInfo: null,
    adminUsers: [],
    adminSettings: null,
    systemStatus: null,
    systemLogs: [],
    activeLead: null,
    activeQuote: null,
    activeChat: null,
    loadingLeads: false,
    loadingQuotes: false,
    loadingKb: false,
    loadingEmails: false,
    loadingChats: false,
    loadingMessages: false,
    aiProcessing: false,
    error: null,
    notifications: [],

    fetchLeads: async () => {
      set({ loadingLeads: true, error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/leads`, { headers })
        if (!res.ok) throw new Error("Failed to load leads")
        const data = await res.json()
        set({ leads: data, loadingLeads: false })
      } catch (err: any) {
        set({ error: err.message, loadingLeads: false })
      }
    },

    fetchKbFiles: async () => {
      set({ loadingKb: true, error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/kb`, { headers })
        if (!res.ok) throw new Error("Failed to load knowledge base files")
        const data = await res.json()
        set({ kbFiles: data, loadingKb: false })
      } catch (err: any) {
        set({ error: err.message, loadingKb: false })
      }
    },

    fetchQuotes: async () => {
      set({ loadingQuotes: true, error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/quotes`, { headers })
        if (!res.ok) throw new Error("Failed to load quotes")
        const data = await res.json()
        set({ quotes: data, loadingQuotes: false })
      } catch (err: any) {
        set({ error: err.message, loadingQuotes: false })
      }
    },

    setActiveLead: async (lead: Lead | null) => {
      set({ activeLead: lead, activeQuote: null, error: null })
      if (!lead) return
      
      // Attempt to load existing quote for this lead
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/quotes/lead/${lead.id}`, { headers })
        if (res.status === 404) {
          set({ activeQuote: null })
          return
        }
        if (!res.ok) throw new Error("Failed to load quote details")
        const quote = await res.json()
        set({ activeQuote: quote })
      } catch (err: any) {
        set({ activeQuote: null })
      }
    },

    createLead: async (title: string, rawText: string) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/leads`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ title, raw_text: rawText, source: 'manual' })
        })
        if (!res.ok) throw new Error("Failed to submit lead")
        await get().fetchLeads()
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    deleteLead: async (leadId: string) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}`, {
          method: 'DELETE',
          headers
        })
        if (!res.ok) throw new Error("Failed to delete lead")
        if (get().activeLead?.id === leadId) {
          set({ activeLead: null, activeQuote: null })
        }
        await get().fetchLeads()
      } catch (err: any) {
        set({ error: err.message })
      }
    },

    uploadKbFile: async (file: File) => {
      const MAX_SIZE = 5 * 1024 * 1024
      if (file.size > MAX_SIZE) {
        throw new Error("File size exceeds the maximum limit of 5MB")
      }

      set({ loadingKb: true, error: null })
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error("No active authenticated session")
        const userId = session.user.id
        
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
        const storagePath = `${userId}/${Date.now()}_${sanitizedName}`
        
        const { error: uploadError } = await supabase.storage
          .from('knowledge_base')
          .upload(storagePath, file)
          
        if (uploadError) throw uploadError
        
        const headers = await getAuthHeaders()
        const processUrl = `${BACKEND_URL}/api/kb/process?file_path=${encodeURIComponent(storagePath)}&filename=${encodeURIComponent(file.name)}`
        const processRes = await fetch(processUrl, {
          method: 'POST',
          headers
        })
        
        if (!processRes.ok) {
          const errData = await processRes.json()
          throw new Error(errData.detail || "Backend failed to process file")
        }
        
        await get().fetchKbFiles()
      } catch (err: any) {
        set({ error: err.message, loadingKb: false })
        throw err
      }
    },

    deleteKbFile: async (kbId: string) => {
      set({ loadingKb: true, error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/kb/${kbId}`, {
          method: 'DELETE',
          headers
        })
        if (!res.ok) throw new Error("Failed to delete knowledge file")
        await get().fetchKbFiles()
      } catch (err: any) {
        set({ error: err.message, loadingKb: false })
      }
    },

    updateKbFileContent: async (kbId: string, filename: string, content: string) => {
      set({ loadingKb: true, error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/kb/${kbId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ filename, parsed_content: content })
        })
        if (!res.ok) throw new Error("Failed to update knowledge file contents")
        await get().fetchKbFiles()
      } catch (err: any) {
        set({ error: err.message, loadingKb: false })
        throw err
      }
    },

    runAiEngine: async (leadId: string) => {
      set({ aiProcessing: true, error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/quotes/generate`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ lead_id: leadId })
        })
        
        if (!res.ok) {
          const errData = await res.json()
          throw new Error(errData.detail || "AI pricing engine failed")
        }
        
        const quote = await res.json()
        set({ activeQuote: quote, aiProcessing: false })
        await get().fetchLeads()
      } catch (err: any) {
        set({ error: err.message, aiProcessing: false })
        throw err
      }
    },

    updateQuote: async (quoteId: string, updates: Partial<Quote>) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/quotes/${quoteId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(updates)
        })
        if (!res.ok) throw await toApiError(res, "Failed to save quote changes")
        const quote = await res.json()
        set({ activeQuote: quote })
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    dispatchQuote: async (quoteId: string, options: DispatchOptions = {}) => {
      set({ error: null })
      const headers = await getAuthHeaders()
      const res = await fetch(`${BACKEND_URL}/api/quotes/${quoteId}/dispatch`, {
        method: 'POST',
        headers,
        body: JSON.stringify(options)
      })
      // Not stored in `error`: the caller turns coded failures (unpriced items,
      // no mailbox) into a follow-up question instead of a banner.
      if (!res.ok) throw await toApiError(res, "Failed to send quote")
      const quote = await res.json()
      set({ activeQuote: quote })
      return quote
    },

    setQuoteOutcome: async (quoteId: string, outcome: 'accepted' | 'declined' | null) => {
      const headers = await getAuthHeaders()
      const res = await fetch(`${BACKEND_URL}/api/quotes/${quoteId}/outcome`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ outcome })
      })
      if (!res.ok) throw await toApiError(res, "Failed to update the quote outcome")
      const quote = await res.json()
      if (get().activeQuote?.id === quoteId) set({ activeQuote: quote })
      set({
        dispatchedQuotes: get().dispatchedQuotes.map((q: any) =>
          q.id === quoteId ? { ...q, outcome: quote.outcome, outcome_source: quote.outcome_source } : q
        )
      })
    },

    fetchQuoteAnalytics: async () => {
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/quotes/analytics`, { headers })
        if (!res.ok) return
        set({ quoteAnalytics: await res.json() })
      } catch {
        // Analytics are supplementary; the report table still renders without them.
      }
    },

    // New Simulated Emails Actions
    fetchEmails: async () => {
      set({ loadingEmails: true, error: null })
      try {
        const headers = await getAuthHeaders()
        // The inbox stays empty until a mailbox is connected in settings.
        const statusRes = await fetch(`${BACKEND_URL}/api/emails/status`, { headers })
        if (!statusRes.ok) throw new Error("Failed to load customer emails")
        const { configured } = await statusRes.json()
        if (!configured) {
          set((state) => ({
            emails: [],
            emailConfigured: false,
            loadingEmails: false,
            notifications: state.notifications.filter((n) => n.type !== 'email')
          }))
          return
        }
        const res = await fetch(`${BACKEND_URL}/api/emails`, { headers })
        if (!res.ok) throw new Error("Failed to load customer emails")
        const data = await res.json()
        set({ emails: data, emailConfigured: true, loadingEmails: false })
        
        // Add notifications for unread emails
        data.forEach((email: any) => {
          if (email.status === 'unread') {
            get().addNotification({
              id: `email-${email.id}`,
              title: `New Email from ${email.sender_email}`,
              description: email.subject,
              type: 'email',
              created_at: email.created_at,
              read: false
            })
          }
        })
      } catch (err: any) {
        set({ error: err.message, loadingEmails: false })
      }
    },

    transferEmail: async (emailId: string) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/emails/${emailId}/transfer`, {
          method: 'POST',
          headers
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.detail || "Failed to transfer email to leads")
        }
        await get().fetchEmails()
        await get().fetchLeads()
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    replyEmail: async (emailId: string, replyBody: string) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/emails/${emailId}/reply`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ reply_body: replyBody })
        })
        if (!res.ok) throw new Error("Failed to dispatch email reply")
        const data = await res.json()
        await get().fetchEmails()
        return data
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    // New WhatsApp Actions
    fetchChats: async () => {
      set({ loadingChats: true, error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/whatsapp/chats`, { headers })
        if (!res.ok) throw new Error("Failed to load WhatsApp chats")
        const data = await res.json()
        set({ whatsappChats: data, loadingChats: false })
        
        // Add notifications for chats in human_required mode
        data.forEach((chat: any) => {
          if (chat.status === 'human_required') {
            get().addNotification({
              id: `whatsapp-${chat.id}`,
              title: `WhatsApp Escalation`,
              description: `Chat with ${chat.customer_name} (${chat.phone_number}) requires human override.`,
              type: 'whatsapp',
              created_at: chat.created_at,
              read: false
            })
          }
        })
      } catch (err: any) {
        set({ error: err.message, loadingChats: false })
      }
    },

    setActiveChat: async (chat: WhatsAppChat | null) => {
      set({ activeChat: chat, whatsappMessages: [], error: null })
      if (chat) {
        await get().fetchChatMessages(chat.id)
      }
    },

    fetchChatMessages: async (chatId: string) => {
      const currentMessages = get().whatsappMessages
      if (currentMessages.length === 0) {
        set({ loadingMessages: true })
      }
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/whatsapp/chats/${chatId}/messages`, { headers })
        if (!res.ok) throw new Error("Failed to load chat history")
        const data = await res.json()
        set({ whatsappMessages: data, loadingMessages: false })
      } catch (err: any) {
        set({ error: err.message, loadingMessages: false })
      }
    },

    sendWhatsAppMessage: async (chatId: string, text: string) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/whatsapp/chats/${chatId}/send`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ text })
        })
        if (!res.ok) throw new Error("Failed to dispatch manual text")
        const result = await res.json()
        await get().fetchChatMessages(chatId)
        return { delivered: result.delivered !== false, reason: result.reason || null }
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    fetchWhatsAppStatus: async () => {
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/whatsapp/status`, { headers })
        if (res.ok) set({ whatsappStatus: await res.json() })
      } catch {
        // The banner simply stays hidden if the check cannot run.
      }
    },

    toggleTakeover: async (chatId: string, statusMode: 'active_ai' | 'human_required') => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/whatsapp/chats/${chatId}/takeover`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ status_mode: statusMode })
        })
        if (!res.ok) throw new Error("Failed to update responder mode")
        const updatedChat = await res.json()
        
        // Update local status of the active chat
        set({ activeChat: updatedChat })
        
        // Reload list and logs
        await get().fetchChats()
        await get().fetchChatMessages(chatId)
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    exportWhatsAppLeads: async () => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/whatsapp/export`, { headers })
        if (!res.ok) throw new Error("Failed to generate leads export")
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'whatsapp_leads_export.csv'
        document.body.appendChild(a)
        a.click()
        a.remove()
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    fetchDispatchedQuotes: async () => {
      set({ loadingDispatched: true, error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/quotes/dispatched`, { headers })
        if (!res.ok) throw new Error("Failed to load dispatched quotes report")
        const data = await res.json()
        set({ dispatchedQuotes: data, loadingDispatched: false })
      } catch (err: any) {
        set({ error: err.message, loadingDispatched: false })
      }
    },

    reimportLead: async (leadId: string) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}/reimport`, {
          method: 'POST',
          headers
        })
        if (!res.ok) throw new Error("Failed to reimport lead")
        await get().fetchLeads()
        set({ activeLead: null, activeQuote: null })
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    fetchProfile: async () => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/users/profile`, { headers })
        if (!res.ok) throw new Error("Failed to load profile")
        const data = await res.json()
        set({ userProfile: data })
        return data
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    updateProfile: async (profileData: any) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/users/profile`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(profileData)
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.detail || "Failed to update profile")
        }
        const data = await res.json()
        if (data?.profile) {
          set({ userProfile: data.profile })
          return data.profile
        }
        return await get().fetchProfile()
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    completeOnboarding: async (onboardingData: any) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/users/onboarding`, {
          method: 'POST',
          headers,
          body: JSON.stringify(onboardingData)
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.detail || "Failed to complete onboarding setup")
        }
        const data = await res.json()
        if (data?.profile) {
          set({ userProfile: data.profile })
          return data.profile
        }
        return await get().fetchProfile()
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    seedSampleKb: async () => {
      set({ loadingKb: true, error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/users/onboarding/sample-kb`, {
          method: 'POST',
          headers
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.detail || "Failed to load sample pricing catalog")
        }
        await get().fetchKbFiles()
      } catch (err: any) {
        set({ error: err.message, loadingKb: false })
        throw err
      }
    },

    fetchTeam: async () => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/users/team`, { headers })
        if (!res.ok) throw new Error("Failed to load team workspace details")
        const data = await res.json()
        set({ teamInfo: data })
        return data
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    verifyInviteToken: async (token: string) => {
      const res = await fetch(
        `${BACKEND_URL}/api/users/team/invite-info?token=${encodeURIComponent(token)}`
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || "Invalid or expired invitation link")
      }
      return await res.json()
    },

    acceptTeamInvite: async (inviteToken: string, name?: string) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/users/team/accept-invite`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ invite_token: inviteToken, name })
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.detail || "Failed to join team workspace")
        }
        const data = await res.json()
        if (data?.profile) {
          set({ userProfile: data.profile })
        }
        return data
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    fetchCustomers: async () => {
      set({ loadingCustomers: true })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/customers`, { headers })
        if (!res.ok) throw new Error("Failed to load customers")
        set({ customers: await res.json(), loadingCustomers: false })
      } catch (err: any) {
        set({ error: err.message, loadingCustomers: false })
      }
    },

    fetchCustomerHistory: async (key: string) => {
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/customers/history?key=${encodeURIComponent(key)}`, { headers })
        if (!res.ok) return null
        return await res.json()
      } catch {
        return null
      }
    },

    uploadPartFile: async (leadId: string, file: File) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("No active authenticated session")
      const form = new FormData()
      form.append('file', file)
      // No Content-Type header: the browser sets the multipart boundary itself.
      const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}/part-file`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form
      })
      if (!res.ok) throw await toApiError(res, "The part file could not be measured")
      const data = await res.json()
      set({
        leads: get().leads.map((l) => (l.id === leadId ? data.lead : l)),
        activeLead: get().activeLead?.id === leadId ? data.lead : get().activeLead,
      })
    },

    fetchMailConnection: async () => {
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/oauth/status`, { headers })
        if (res.ok) set({ mailConnection: await res.json() })
      } catch {
        // Settings falls back to the app-password form.
      }
    },

    startMailConnect: async (provider: string) => {
      const headers = await getAuthHeaders()
      const res = await fetch(`${BACKEND_URL}/api/oauth/${provider}/start`, { headers })
      if (!res.ok) throw await toApiError(res, "Could not start the sign-in")
      const { url } = await res.json()
      window.location.assign(url)
    },

    disconnectMail: async () => {
      const headers = await getAuthHeaders()
      const res = await fetch(`${BACKEND_URL}/api/oauth/connection`, { method: 'DELETE', headers })
      if (!res.ok) throw await toApiError(res, "Could not disconnect the mailbox")
      await get().fetchMailConnection()
    },

    fetchAutomation: async () => {
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/automation`, { headers })
        if (res.ok) set({ automation: await res.json() })
      } catch {
        // Settings page shows the defaults if this fails.
      }
    },

    saveAutomation: async (changes: Partial<AutomationSettings>) => {
      const headers = await getAuthHeaders()
      const res = await fetch(`${BACKEND_URL}/api/automation`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(changes)
      })
      if (!res.ok) throw await toApiError(res, "Failed to save automation settings")
      set({ automation: await res.json() })
    },

    changePassword: async (currentPassword: string, password: string) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/users/change-password`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ current_password: currentPassword, new_password: password })
        })
        if (!res.ok) {
          const errData = await res.json()
          throw new Error(errData.detail || "Failed to update password")
        }
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    fetchAdminSettings: async () => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/admin/settings`, { headers })
        if (!res.ok) throw new Error("Failed to fetch global parameters")
        const data = await res.json()
        set({ adminSettings: data })
        return data
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    saveAdminSettings: async (rates: { base_labor_rate: number; base_material_markup: number }) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/admin/settings`, {
          method: 'POST',
          headers,
          body: JSON.stringify(rates)
        })
        if (!res.ok) throw new Error("Failed to update global parameters")
        const data = await res.json()
        set({ adminSettings: data.settings })
        return data.settings
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    adminListUsers: async () => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/admin/users`, { headers })
        if (!res.ok) throw new Error("Failed to fetch admin users list")
        const data = await res.json()
        set({ adminUsers: data })
        return data
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    adminCreateUser: async (userData: any) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
          method: 'POST',
          headers,
          body: JSON.stringify(userData)
        })
        if (!res.ok) {
          const errData = await res.json()
          throw new Error(errData.detail || "Failed to create user via admin panel")
        }
        await get().adminListUsers()
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    adminUpdateUser: async (userId: string, data: any) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(data)
        })
        if (!res.ok) throw new Error("Failed to update user profile via admin panel")
        await get().adminListUsers()
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    adminDeleteUser: async (userId: string) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
          method: 'DELETE',
          headers
        })
        if (!res.ok) throw new Error("Failed to delete user via admin panel")
        await get().adminListUsers()
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    fetchSystemStatus: async () => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/admin/system-status`, { headers })
        if (!res.ok) throw new Error("Failed to fetch system status")
        const data = await res.json()
        set({ systemStatus: data })
        return data
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    fetchSystemLogs: async () => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/admin/logs`, { headers })
        if (!res.ok) throw new Error("Failed to fetch system logs")
        const data = await res.json()
        set({ systemLogs: data })
        return data
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    logSystemAction: async (source: string, level: string, message: string) => {
      try {
        const headers = await getAuthHeaders()
        await fetch(`${BACKEND_URL}/api/admin/logs`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ source, level, message })
        })
      } catch (err) {
        console.error("Failed to post system log:", err)
      }
    },

    addNotification: (notification: any) => {
      set((state) => {
        if (state.notifications.some((n) => n.id === notification.id)) return {}
        return { notifications: [notification, ...state.notifications] }
      })
    },

    markNotificationsAsRead: () => {
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true }))
      }))
    }
  }
})

