import React, { useEffect, useState, useRef } from 'react'
import { useWorkspaceStore, WhatsAppChat } from '../store/workspaceStore'
import { supabase } from '../lib/supabase'
import {
  MessageSquare,
  Download,
  Send,
  Bot,
  User,
  Loader2,
  Search,
  RefreshCw,
  FlaskConical,
  AlertTriangle,
  X
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

type ModeFilter = 'all' | 'active_ai' | 'human_required'

const MODE_FILTERS: { id: ModeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'human_required', label: 'Needs you' },
  { id: 'active_ai', label: 'AI handling' }
]

const dayLabel = (iso: string): string => {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

export default function WhatsAppDashboard() {
  const {
    userProfile,
    whatsappChats,
    whatsappMessages,
    activeChat,
    loadingChats,
    loadingMessages,
    fetchChats,
    setActiveChat,
    sendWhatsAppMessage,
    whatsappStatus,
    fetchWhatsAppStatus,
    toggleTakeover,
    exportWhatsAppLeads,
    fetchProfile
  } = useWorkspaceStore()

  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [takeoverProcessing, setTakeoverProcessing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [simError, setSimError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Simulation Modal States
  const [showSimulateModal, setShowSimulateModal] = useState(false)
  const [simName, setSimName] = useState('John Doe')
  const [simPhone, setSimPhone] = useState('+12025550143')
  const [simBody, setSimBody] = useState('Hi, I need a quotation for custom welding on 10 structural plates.')
  const [simTo, setSimTo] = useState('')
  const [simulating, setSimulating] = useState(false)

  useEffect(() => {
    fetchChats()
    fetchProfile().catch(() => {})
  }, [fetchChats, fetchProfile])

  // Polling for live chat updates every 4 seconds when a chat is open
  useEffect(() => {
    if (!activeChat) return
    const interval = setInterval(() => {
      useWorkspaceStore.getState().fetchChatMessages(activeChat.id)
    }, 4000)
    return () => clearInterval(interval)
  }, [activeChat])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [whatsappMessages])

  const [sendProblem, setSendProblem] = useState<string | null>(null)

  useEffect(() => {
    fetchWhatsAppStatus()
  }, [fetchWhatsAppStatus])

  const connectionProblems: string[] = []
  if (whatsappStatus) {
    if (!whatsappStatus.credentials_saved) {
      connectionProblems.push('Twilio is not connected, so no WhatsApp messages can be sent. Add your Account SID, Auth Token and WhatsApp number in Settings.')
    } else if (whatsappStatus.credentials_valid === false) {
      connectionProblems.push(`Messages cannot be sent: ${whatsappStatus.credentials_error}`)
    } else if (whatsappStatus.credentials_error) {
      connectionProblems.push(whatsappStatus.credentials_error)
    }
    if (!whatsappStatus.webhook_public) {
      connectionProblems.push(
        'Messages cannot be received: this server is only reachable on your own computer, so Twilio cannot deliver incoming messages to it. Give the backend a public https address, set PUBLIC_BACKEND_URL to it, and paste <that address>/api/whatsapp/webhook into Twilio as the "When a message comes in" URL.'
      )
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeChat || !messageText.trim() || sending) return
    setSending(true)
    setSendProblem(null)
    try {
      const result = await sendWhatsAppMessage(activeChat.id, messageText)
      setMessageText('')
      if (!result.delivered) setSendProblem(result.reason || 'The message was saved but not delivered.')
    } catch (err) {
      console.error(err)
      setSendProblem('The message could not be sent. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleTakeoverToggle = async () => {
    if (!activeChat || takeoverProcessing) return
    setTakeoverProcessing(true)
    const nextMode = activeChat.status === 'active_ai' ? 'human_required' : 'active_ai'
    try {
      await toggleTakeover(activeChat.id, nextMode)
    } catch (err) {
      console.error(err)
    } finally {
      setTakeoverProcessing(false)
    }
  }

  const handleSimulateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSimulating(true)
    setSimError(null)
    try {
      const formData = new URLSearchParams()
      formData.append('From', `whatsapp:${simPhone}`)
      formData.append('Body', simBody)
      formData.append('ProfileName', simName)
      if (simTo) {
        formData.append('To', `whatsapp:${simTo}`)
      }
      
      // The simulator authenticates as the logged-in user; the backend routes the
      // message to that user's own tenant (no client-chosen tenant IDs).
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("No active authenticated session")
      const customHeaders: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${session.access_token}`
      }
      
      const res = await fetch(`${BACKEND_URL}/api/whatsapp/webhook`, {
        method: 'POST',
        headers: customHeaders,
        body: formData.toString()
      })
      if (!res.ok) throw new Error("Simulation failed")
      
      setShowSimulateModal(false)
      // Refresh chats list
      await fetchChats()
    } catch (err: any) {
      console.error(err)
      setSimError(err?.message || 'The test message could not be delivered.')
    } finally {
      setSimulating(false)
    }
  }

  const counts: Record<ModeFilter, number> = {
    all: whatsappChats.length,
    active_ai: whatsappChats.filter((c) => c.status === 'active_ai').length,
    human_required: whatsappChats.filter((c) => c.status === 'human_required').length
  }

  const filteredChats = whatsappChats.filter((chat) => {
    if (modeFilter !== 'all' && chat.status !== modeFilter) return false
    const term = searchTerm.trim().toLowerCase()
    if (!term) return true
    return (chat.customer_name || '').toLowerCase().includes(term) || chat.phone_number.includes(term)
  })

  const isAiMode = activeChat?.status === 'active_ai'
  const twilioConnected = !!(userProfile?.has_twilio_sid && userProfile?.has_twilio_token && userProfile?.has_twilio_phone)

  const submitOnEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
      <PageHeader
        title="WhatsApp"
        description="Customer conversations. The assistant replies automatically until you take over."
        actions={
          <>
            <button onClick={() => { setSimError(null); setShowSimulateModal(true) }} className="btn btn-secondary">
              <FlaskConical className="h-4 w-4" />
              Send test message
            </button>
            <button onClick={() => exportWhatsAppLeads()} className="btn btn-secondary" disabled={whatsappChats.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </>
        }
      />

      {(connectionProblems.length > 0 || sendProblem) && (
        <div className="px-6 pt-4 space-y-2">
          {sendProblem && (
            <div className="alert alert-error" role="alert">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>Not delivered. {sendProblem}</p>
            </div>
          )}
          {connectionProblems.map((problem) => (
            <div key={problem} className="alert alert-warning" role="status">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>{problem}</p>
            </div>
          ))}
          {whatsappStatus?.webhook_public && whatsappStatus.credentials_valid && (
            <p className="text-xs text-slate-500 break-all">Twilio webhook URL: {whatsappStatus.webhook_url}</p>
          )}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Conversation list */}
        <section className="w-[340px] shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/40" aria-label="Conversations">
          <div className="p-3 border-b border-slate-800 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="search"
                  placeholder="Search name or number"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input pl-9"
                />
              </div>
              <button onClick={() => fetchChats()} className="btn-icon shrink-0" aria-label="Refresh conversations" title="Refresh">
                <RefreshCw className={`h-4 w-4 ${loadingChats ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="flex gap-1" role="tablist" aria-label="Filter conversations">
              {MODE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={modeFilter === f.id}
                  onClick={() => setModeFilter(f.id)}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    modeFilter === f.id ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-850'
                  }`}
                >
                  {f.label}
                  <span className="ml-1.5 text-slate-500 tabular-nums">{counts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingChats && whatsappChats.length === 0 ? (
              <div className="divide-y divide-slate-800">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
                    <div className="h-9 w-9 rounded-full bg-slate-800" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-slate-800 rounded w-1/2" />
                      <div className="h-3 bg-slate-850 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredChats.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title={whatsappChats.length === 0 ? 'No conversations yet' : 'No conversations match'}
                description={
                  whatsappChats.length === 0
                    ? twilioConnected
                      ? 'Messages sent to your WhatsApp number will appear here.'
                      : 'Connect your Twilio WhatsApp number in Settings, or send a test message to see how it works.'
                    : 'Try a different search or filter.'
                }
              />
            ) : (
              <ul className="divide-y divide-slate-800">
                {filteredChats.map((chat) => {
                  const isSelected = activeChat?.id === chat.id
                  const needsHuman = chat.status === 'human_required'
                  return (
                    <li key={chat.id}>
                      <button
                        data-testid="list-item"
                        onClick={() => setActiveChat(chat)}
                        aria-current={isSelected}
                        className={`relative w-full text-left flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer ${
                          isSelected ? 'bg-slate-800/70' : 'hover:bg-slate-850'
                        }`}
                      >
                        {isSelected && <span className="absolute inset-y-0 left-0 w-0.5 bg-brand-500" />}
                        <span className="h-9 w-9 shrink-0 rounded-full bg-slate-800 text-slate-200 text-sm font-semibold flex items-center justify-center">
                          {(chat.customer_name || '?').charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium text-slate-100">{chat.customer_name || 'Unknown contact'}</span>
                            <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                              {new Date(chat.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-slate-500 tabular-nums">{chat.phone_number}</span>
                            <span className={`badge shrink-0 ${needsHuman ? 'badge-warning' : 'badge-neutral'}`}>
                              {needsHuman ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                              {needsHuman ? 'Needs you' : 'AI'}
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Conversation */}
        <section className="flex-1 min-w-0 flex flex-col" aria-label="Conversation">
          {activeChat ? (
            <>
              <div className="h-16 px-6 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-9 w-9 shrink-0 rounded-full bg-slate-800 text-slate-200 text-sm font-semibold flex items-center justify-center">
                    {(activeChat.customer_name || '?').charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-slate-50">{activeChat.customer_name || 'Unknown contact'}</h2>
                    <p className="truncate text-xs text-slate-500 tabular-nums">{activeChat.phone_number}</p>
                  </div>
                </div>

                {/* Who is replying */}
                <div className="flex items-center gap-2 shrink-0">
                  {takeoverProcessing && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                  <div className="inline-flex rounded-md border border-slate-700 bg-slate-950 p-0.5" role="group" aria-label="Who replies">
                    <button
                      onClick={() => !isAiMode && handleTakeoverToggle()}
                      disabled={takeoverProcessing}
                      aria-pressed={isAiMode}
                      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                        isAiMode ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      <Bot className="h-3.5 w-3.5" />
                      AI replies
                    </button>
                    <button
                      onClick={() => isAiMode && handleTakeoverToggle()}
                      disabled={takeoverProcessing}
                      aria-pressed={!isAiMode}
                      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                        !isAiMode ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      <User className="h-3.5 w-3.5" />
                      I reply
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                {loadingMessages ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                  </div>
                ) : whatsappMessages.length === 0 ? (
                  <p className="py-16 text-center text-xs text-slate-500">No messages in this conversation yet.</p>
                ) : (
                  <div className="mx-auto max-w-3xl space-y-1.5">
                    {whatsappMessages.map((msg, index) => {
                      const isSystem = msg.sender === 'system'
                      const isCustomer = msg.sender === 'customer'
                      const previous = whatsappMessages[index - 1]
                      const newDay = !previous || new Date(previous.created_at).toDateString() !== new Date(msg.created_at).toDateString()
                      const newSender = newDay || previous.sender !== msg.sender
                      const time = new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                      return (
                        <React.Fragment key={msg.id}>
                          {newDay && (
                            <div className="flex items-center gap-3 py-3">
                              <span className="h-px flex-1 bg-slate-800" />
                              <span className="text-[11px] font-medium text-slate-500">{dayLabel(msg.created_at)}</span>
                              <span className="h-px flex-1 bg-slate-800" />
                            </div>
                          )}
                          {isSystem ? (
                            <p className="py-1.5 text-center text-xs text-slate-500">{msg.text}</p>
                          ) : (
                            <div className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'} ${newSender ? 'pt-2.5' : ''}`}>
                              {newSender && (
                                <span className="mb-1 px-1 text-[11px] text-slate-500">
                                  {isCustomer ? activeChat.customer_name || 'Customer' : msg.sender === 'agent' ? 'You' : 'Assistant'}
                                </span>
                              )}
                              <div
                                title={time}
                                className={`max-w-[72%] rounded-lg px-3.5 py-2 text-sm leading-6 whitespace-pre-wrap break-words ${
                                  isCustomer ? 'bg-slate-850 text-slate-100 border border-slate-800' : 'bg-brand-600 text-white'
                                }`}
                              >
                                {msg.text}
                              </div>
                              <span className="mt-1 px-1 text-[11px] text-slate-600 tabular-nums">{time}</span>
                            </div>
                          )}
                        </React.Fragment>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800 bg-slate-900/40 px-6 py-4 shrink-0">
                <form onSubmit={handleSendMessage} className="mx-auto max-w-3xl">
                  <div className="flex items-end gap-2">
                    <textarea
                      rows={1}
                      placeholder={`Message ${activeChat.customer_name || 'customer'}`}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={submitOnEnter}
                      aria-label="Message"
                      className="input flex-1 resize-none min-h-[40px] max-h-40 leading-6"
                    />
                    <button type="submit" disabled={sending || !messageText.trim()} className="btn btn-primary h-10">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {isAiMode
                      ? 'The assistant is replying to this customer. Sending a message yourself switches the conversation to you.'
                      : 'You are replying to this customer. The assistant stays quiet until you hand it back.'}
                  </p>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState icon={MessageSquare} title="Select a conversation" description="Choose a conversation on the left to read it and reply." />
            </div>
          )}
        </section>
      </div>

      {/* Test message dialog */}
      {showSimulateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSimulateModal(false) }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="sim-title" className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 shadow-popover">
            <div className="flex items-start justify-between gap-4 px-5 pt-5">
              <div>
                <h3 id="sim-title" className="text-base font-semibold text-slate-50">Send a test message</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Creates an incoming WhatsApp message as if a customer sent it, so you can check the assistant's reply.
                </p>
              </div>
              <button onClick={() => setShowSimulateModal(false)} className="btn-icon h-8 w-8 border-transparent shrink-0" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSimulateSubmit} className="px-5 pb-5 pt-4 space-y-4">
              {simError && <div className="alert alert-error" role="alert">{simError}</div>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sim-name" className="label">Customer name</label>
                  <input id="sim-name" type="text" required value={simName} onChange={(e) => setSimName(e.target.value)} className="input" />
                </div>
                <div>
                  <label htmlFor="sim-phone" className="label">Customer number</label>
                  <input id="sim-phone" type="tel" required value={simPhone} onChange={(e) => setSimPhone(e.target.value)} className="input tabular-nums" />
                </div>
              </div>

              <div>
                <label htmlFor="sim-to" className="label">Your WhatsApp number <span className="text-slate-500 font-normal">(optional)</span></label>
                <input id="sim-to" type="tel" value={simTo} onChange={(e) => setSimTo(e.target.value)} placeholder="+14155238886" className="input tabular-nums" />
              </div>

              <div>
                <label htmlFor="sim-body" className="label">Message</label>
                <textarea id="sim-body" required rows={3} value={simBody} onChange={(e) => setSimBody(e.target.value)} className="input resize-none leading-6" />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowSimulateModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={simulating} className="btn btn-primary">
                  {simulating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {simulating ? 'Sending' : 'Send test message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
