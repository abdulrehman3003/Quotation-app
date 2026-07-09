import React, { useEffect, useState, useRef } from 'react'
import { useWorkspaceStore, WhatsAppChat } from '../store/workspaceStore'
import { 
  MessageSquare, 
  Download, 
  Send, 
  Bot, 
  User, 
  Loader2, 
  Search, 
  RefreshCw,
  PlusCircle,
  X
} from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

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
    toggleTakeover,
    exportWhatsAppLeads,
    fetchProfile
  } = useWorkspaceStore()

  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [takeoverProcessing, setTakeoverProcessing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeChat || !messageText.trim() || sending) return
    setSending(true)
    try {
      await sendWhatsAppMessage(activeChat.id, messageText)
      setMessageText('')
    } catch (err) {
      console.error(err)
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
    try {
      const formData = new URLSearchParams()
      formData.append('From', `whatsapp:${simPhone}`)
      formData.append('Body', simBody)
      formData.append('ProfileName', simName)
      if (simTo) {
        formData.append('To', `whatsapp:${simTo}`)
      }
      
      const customHeaders: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
      if (userProfile?.id) {
        customHeaders['x-simulated-user-id'] = userProfile.id
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
    } catch (err) {
      console.error(err)
    } finally {
      setSimulating(false)
    }
  }

  const filteredChats = whatsappChats.filter(chat => 
    chat.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    chat.phone_number.includes(searchTerm)
  )

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100 relative">
      {/* Top Header Section */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-emerald-400" />
            WhatsApp Portal
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor incoming leads, auto-reply via Gemini, and manually chat when escalated.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSimulateModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-lg hover:shadow-emerald-500/20"
          >
            <PlusCircle className="h-4 w-4" />
            Simulate Inbound Message
          </button>

          <button
            onClick={() => exportWhatsAppLeads()}
            className="px-4 py-2 border border-slate-700 hover:border-slate-600 bg-slate-900/60 hover:bg-slate-800 text-slate-200 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Export CSV Leads
          </button>
        </div>
      </div>

      {/* Grid Dashboard */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Hand Column: Lead Table View */}
        <div className="w-1/2 border-r border-slate-800 flex flex-col bg-slate-900/10">
          {/* Table Control Header */}
          <div className="p-4 border-b border-slate-800/80 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800/80 focus:border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-0 transition-all"
              />
            </div>
            
            <button 
              onClick={() => fetchChats()}
              className="p-2 border border-slate-800/80 hover:border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {/* Lead Table Container */}
          <div className="flex-1 overflow-auto">
            {loadingChats ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                <MessageSquare className="h-8 w-8 mb-2 stroke-[1.5]" />
                <p className="text-sm">No WhatsApp quotation leads found.</p>
              </div>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 bg-slate-900/30">
                    <th className="px-6 py-3">Customer</th>
                    <th className="px-6 py-3">Phone</th>
                    <th className="px-6 py-3">Responder Mode</th>
                    <th className="px-6 py-3 text-right">Inquiry Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {filteredChats.map((chat) => {
                    const isSelected = activeChat?.id === chat.id
                    return (
                      <tr
                        key={chat.id}
                        onClick={() => setActiveChat(chat)}
                        className={`hover:bg-slate-900/50 cursor-pointer transition-all duration-150 ${
                          isSelected ? 'bg-slate-800/40' : ''
                        }`}
                      >
                        <td className="px-6 py-4">
                          <span className="font-semibold text-white text-sm block">
                            {chat.customer_name}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-slate-300">
                          {chat.phone_number}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            chat.status === 'active_ai' 
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {chat.status === 'active_ai' ? (
                              <>
                                <Bot className="h-3 w-3" />
                                AI Auto-Reply
                              </>
                            ) : (
                              <>
                                <User className="h-3 w-3" />
                                HUMAN OVERRIDE
                              </>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-xs text-slate-400">
                          {new Date(chat.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Hand Column: Live Interactive Chat Window */}
        <div className="flex-1 flex flex-col bg-slate-950">
          {activeChat ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Chat Header Status */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="font-bold text-white text-sm">{activeChat.customer_name}</h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">{activeChat.phone_number}</p>
                </div>
                
                <button
                  onClick={handleTakeoverToggle}
                  disabled={takeoverProcessing}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeChat.status === 'active_ai'
                      ? 'bg-amber-600/10 hover:bg-amber-600/20 border border-amber-500/30 text-amber-400'
                      : 'bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-blue-400'
                  }`}
                >
                  {takeoverProcessing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : activeChat.status === 'active_ai' ? (
                    <>
                      <User className="h-3.5 w-3.5" />
                      Takeover manually
                    </>
                  ) : (
                    <>
                      <Bot className="h-3.5 w-3.5" />
                      Handover to AI auto-reply
                    </>
                  )}
                </button>
              </div>

              {/* Chat Messages Log */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-950">
                {loadingMessages ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                  </div>
                ) : whatsappMessages.length === 0 ? (
                  <p className="text-slate-600 text-center italic py-20 text-xs">No chat history recorded.</p>
                ) : (
                  whatsappMessages.map((msg) => {
                    const isSystem = msg.sender === 'system'
                    const isCustomer = msg.sender === 'customer'
                    return (
                      <div 
                        key={msg.id} 
                        className={`flex flex-col max-w-[75%] ${
                          isCustomer 
                            ? 'mr-auto items-start' 
                            : isSystem 
                            ? 'mx-auto items-center text-center' 
                            : 'ml-auto items-end'
                        }`}
                      >
                        <div className={`px-4 py-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                          isCustomer 
                            ? 'bg-slate-900 text-slate-200 rounded-bl-none border border-slate-800/80' 
                            : isSystem 
                            ? 'bg-slate-900/50 text-indigo-400 font-medium border border-indigo-950/40 rounded-lg px-6' 
                            : 'bg-indigo-600 text-white rounded-br-none'
                        }`}>
                          {msg.text}
                        </div>
                        <span className="text-[9px] text-slate-600 mt-1 font-mono">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Box */}
              <div className="p-4 border-t border-slate-800 bg-slate-900/30 shrink-0">
                {activeChat.status === 'active_ai' && (
                  <div className="mb-3 px-3 py-2 bg-blue-500/5 border border-blue-500/10 rounded-lg text-[10px] text-blue-400 flex items-center gap-1.5 animate-pulse">
                    <Bot className="h-3.5 w-3.5 shrink-0" />
                    AI Engine is actively auto-replying. Sending a manual message will hand control over to human.
                  </div>
                )}
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Type message..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-0 transition-all font-sans"
                  />
                  <button
                    type="submit"
                    disabled={sending || !messageText.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-lg text-sm font-semibold flex items-center justify-center transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <MessageSquare className="h-10 w-10 mb-2 stroke-[1.5]" />
              <p className="text-sm">Select a contact lead from the table to begin chatting.</p>
            </div>
          )}
        </div>
      </div>

      {/* Simulation Modal Box */}
      {showSimulateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 relative">
            <button 
              onClick={() => setShowSimulateModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="font-bold text-white text-lg mb-1 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-emerald-400" />
              Simulate Inbound WhatsApp
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Create an artificial inbound message from a client to test webhook, matching, auto-reply, and quoting rules.
            </p>

            <form onSubmit={handleSimulateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Customer Display Name
                </label>
                <input
                  type="text"
                  required
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-4 py-2.5 text-sm text-slate-200 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Customer Phone Number
                </label>
                <input
                  type="text"
                  required
                  value={simPhone}
                  onChange={(e) => setSimPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-4 py-2.5 text-sm text-slate-200 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Recipient Twilio WhatsApp Phone (To)
                </label>
                <input
                  type="text"
                  value={simTo}
                  onChange={(e) => setSimTo(e.target.value)}
                  placeholder="Optional matching receiver number"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-4 py-2.5 text-sm text-slate-200 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Inbound Message Body
                </label>
                <textarea
                  required
                  rows={3}
                  value={simBody}
                  onChange={(e) => setSimBody(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-4 py-2.5 text-sm text-slate-200 outline-none resize-none font-sans"
                />
              </div>

              <button
                type="submit"
                disabled={simulating}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {simulating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing Simulation...
                  </>
                ) : (
                  <>
                    <PlusCircle className="h-4 w-4" />
                    Simulate Message Ingestion
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
