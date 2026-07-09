import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '../store/workspaceStore'
import { Inbox, FileText, Database, PiggyBank, Plus, PlusCircle, Trash } from 'lucide-react'

export const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const {
    leads,
    quotes,
    kbFiles,
    fetchLeads,
    fetchQuotes,
    fetchKbFiles,
    createLead,
    deleteLead,
    loadingLeads,
  } = useWorkspaceStore()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newLeadTitle, setNewLeadTitle] = useState('')
  const [newLeadText, setNewLeadText] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetchLeads()
    fetchQuotes()
    fetchKbFiles()
  }, [fetchLeads, fetchQuotes, fetchKbFiles])

  // Compute metrics
  const totalLeads = leads.length
  const totalQuotes = quotes.length
  const totalKbFiles = kbFiles.length
  
  const avgQuoteVal = quotes.length > 0 
    ? quotes.reduce((acc, q) => acc + Number(q.total_cost), 0) / quotes.length 
    : 0.00

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLeadTitle || !newLeadText) return
    setIsSubmitting(true)
    setSuccess(false)
    try {
      await createLead(newLeadTitle, newLeadText)
      setNewLeadTitle('')
      setNewLeadText('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const statItems = [
    { label: 'Total Ingested Leads', value: totalLeads, icon: Inbox, color: 'text-blue-400', path: '/workspace' },
    { label: 'Calculated Quote Drafts', value: totalQuotes, icon: FileText, color: 'text-indigo-400', path: '/reports' },
    { label: 'Active Knowledge Sheets', value: totalKbFiles, icon: Database, color: 'text-brand-400', path: '/kb' },
    { label: 'Average Quote Value', value: `$${avgQuoteVal.toFixed(2)}`, icon: PiggyBank, color: 'text-emerald-400', path: '/reports' },
  ]

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-slate-950 text-slate-100">
      {/* Welcome Banner */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold font-outfit text-white tracking-tight">System Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Overview of AXRFLOWS pricing engine, lead ingestion channels, and active knowledge models.</p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {loadingLeads ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 animate-pulse flex justify-between items-center">
              <div className="space-y-2.5 w-2/3">
                <div className="h-3 bg-slate-800 rounded w-3/4"></div>
                <div className="h-7 bg-slate-855 rounded w-1/2"></div>
              </div>
              <div className="w-10 h-10 bg-slate-800 rounded-lg"></div>
            </div>
          ))
        ) : (
          statItems.map((stat, i) => {
            const Icon = stat.icon
            return (
              <div
                key={i}
                onClick={() => navigate(stat.path)}
                className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 glass-card hover:shadow-glow-sm transition-all duration-300 cursor-pointer hover:border-slate-700/80 transform hover:-translate-y-0.5"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{stat.label}</p>
                    <p className="text-2xl font-bold font-outfit text-white mt-2">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-lg bg-slate-900 border border-slate-800 ${stat.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Double Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Ingest Unstructured Lead Form */}
        <div className="lg:col-span-1 p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 glass-panel">
          <h2 className="text-lg font-bold font-outfit text-white mb-4 flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-brand-400" />
            Ingest Unstructured Lead
          </h2>
          <form onSubmit={handleAddLead} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Lead Identifier / Title
              </label>
              <input
                type="text"
                required
                value={newLeadTitle}
                onChange={(e) => setNewLeadTitle(e.target.value)}
                placeholder="e.g. Email from John Doe (Apex Corp)"
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 rounded-lg px-4 py-2.5 text-sm outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Raw Email Context / Inquiries
              </label>
              <textarea
                required
                rows={6}
                value={newLeadText}
                onChange={(e) => setNewLeadText(e.target.value)}
                placeholder="Paste the messy B2B email here..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 rounded-lg px-4 py-2.5 text-sm outline-none transition-all resize-none"
              />
            </div>
            
            {success && (
              <div className="p-3 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                Lead ingested successfully! Head to Workspace.
              </div>
            )}
            
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg disabled:bg-indigo-500/50 disabled:cursor-not-allowed transition-all duration-200 text-sm cursor-pointer"
            >
              {isSubmitting ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Submit to Pipeline
                </>
              )}
            </button>
          </form>
        </div>

        {/* Recent Ingested Leads List */}
        <div className="lg:col-span-2 p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 glass-panel flex flex-col">
          <h2 className="text-lg font-bold font-outfit text-white mb-4">Ingestion Feed Queue</h2>
          <div className="flex-1 overflow-y-auto max-h-[360px] pr-2 space-y-3">
            {loadingLeads ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 rounded-lg bg-slate-900/60 border border-slate-800/50 animate-pulse flex justify-between items-center">
                  <div className="space-y-2 w-2/3">
                    <div className="h-4 bg-slate-800 rounded w-1/2"></div>
                    <div className="h-3 bg-slate-850 rounded w-1/3"></div>
                  </div>
                  <div className="w-8 h-8 bg-slate-800 rounded"></div>
                </div>
              ))
            ) : leads.length === 0 ? (
              <div className="py-16 text-center">
                <Inbox className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No leads ingested yet.</p>
              </div>
            ) : (
              leads.map((lead) => (
                <div key={lead.id} className="p-4 rounded-lg bg-slate-900/60 border border-slate-800/50 flex justify-between items-center hover:border-slate-700 transition-all duration-300">
                  <div className="overflow-hidden">
                    <p className="font-semibold text-slate-200 text-sm truncate">{lead.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        lead.status === 'processed' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : lead.status === 'failed'
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                      }`}>
                        {lead.status}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => deleteLead(lead.id)}
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/5 rounded-lg border border-transparent hover:border-red-500/10 transition-all cursor-pointer"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
export default Dashboard
