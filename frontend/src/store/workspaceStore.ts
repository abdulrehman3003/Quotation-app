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
  whatsappChats: WhatsAppChat[]
  whatsappMessages: WhatsAppMessage[]
  dispatchedQuotes: any[]
  loadingDispatched: boolean
  userProfile: any | null
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
  dispatchQuote: (quoteId: string) => Promise<void>
  fetchDispatchedQuotes: () => Promise<void>
  reimportLead: (leadId: string) => Promise<void>
  fetchProfile: () => Promise<any>
  updateProfile: (profileData: any) => Promise<void>
  changePassword: (password: string) => Promise<void>
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
  sendWhatsAppMessage: (chatId: string, text: string) => Promise<void>
  toggleTakeover: (chatId: string, statusMode: 'active_ai' | 'human_required') => Promise<void>
  exportWhatsAppLeads: () => Promise<void>
  notifications: Array<{ id: string; title: string; description: string; type: 'email' | 'whatsapp'; created_at: string; read: boolean }>
  addNotification: (notification: any) => void
  markNotificationsAsRead: () => void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  // Helper to fetch Auth headers
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    if (window.location.hostname.startsWith('admin.')) {
      return {
        'X-Admin-Auth': 'admin',
        'Content-Type': 'application/json'
      }
    }
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
    whatsappChats: [],
    whatsappMessages: [],
    dispatchedQuotes: [],
    loadingDispatched: false,
    userProfile: null,
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
        if (!res.ok) throw new Error("Failed to update quote changes")
        const quote = await res.json()
        set({ activeQuote: quote })
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    dispatchQuote: async (quoteId: string) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/quotes/${quoteId}/dispatch`, {
          method: 'POST',
          headers
        })
        if (!res.ok) {
          const errData = await res.json()
          throw new Error(errData.detail || "Failed to dispatch quote")
        }
        const quote = await res.json()
        set({ activeQuote: quote })
        return quote
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    // New Simulated Emails Actions
    fetchEmails: async () => {
      set({ loadingEmails: true, error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/emails`, { headers })
        if (!res.ok) throw new Error("Failed to load customer emails")
        const data = await res.json()
        set({ emails: data, loadingEmails: false })
        
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
        if (!res.ok) throw new Error("Failed to transfer email to leads")
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
        await get().fetchChatMessages(chatId)
      } catch (err: any) {
        set({ error: err.message })
        throw err
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
        if (!res.ok) throw new Error("Failed to update profile")
        await get().fetchProfile()
      } catch (err: any) {
        set({ error: err.message })
        throw err
      }
    },

    changePassword: async (password: string) => {
      set({ error: null })
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${BACKEND_URL}/api/users/change-password`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ new_password: password })
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

