import React, { useEffect, useState } from 'react'
import { useWorkspaceStore, Lead, ItemizedCost } from '../store/workspaceStore'
import { Mail, Sparkles, AlertTriangle, Send, ShieldCheck, Check, Save, Trash2, X } from 'lucide-react'
import DOMPurify from 'dompurify'

export const PipelineWorkspace: React.FC = () => {
  const {
    leads,
    activeLead,
    activeQuote,
    fetchLeads,
    setActiveLead,
    runAiEngine,
    updateQuote,
    dispatchQuote,
    reimportLead,
    deleteLead,
    aiProcessing,
    error,
  } = useWorkspaceStore()

  const [emailText, setEmailText] = useState('')
  const [materialCost, setMaterialCost] = useState<number>(0)
  const [laborCost, setLaborCost] = useState<number>(0)
  const [totalCost, setTotalCost] = useState<number>(0)
  const [isCopied, setIsCopied] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Custom premium dialog box modal state
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'confirm' | 'info';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  })

  const showSuccess = (title: string, message: string) => {
    setDialog({ isOpen: true, title, message, type: 'success' })
  }

  const showError = (title: string, message: string) => {
    setDialog({ isOpen: true, title, message, type: 'error' })
  }

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setDialog({ isOpen: true, title, message, type: 'confirm', onConfirm })
  }

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  // Sync state variables with active quote changes
  useEffect(() => {
    if (activeQuote) {
      setEmailText(activeQuote.email_draft)
      setMaterialCost(Number(activeQuote.material_cost))
      setLaborCost(Number(activeQuote.labor_cost))
      setTotalCost(Number(activeQuote.total_cost))
    } else {
      setEmailText('')
      setMaterialCost(0)
      setLaborCost(0)
      setTotalCost(0)
    }
  }, [activeQuote])

  // Auto calculate total if material/labor changes
  const handleCostChange = (type: 'material' | 'labor', val: number) => {
    if (type === 'material') {
      setMaterialCost(val)
      setTotalCost(val + laborCost)
    } else {
      setLaborCost(val)
      setTotalCost(materialCost + val)
    }
  }

  const handleRunAi = async () => {
    if (!activeLead) return
    try {
      await runAiEngine(activeLead.id)
    } catch (err) {
      console.error(err)
    }
  }

  const handleSaveDraft = async () => {
    if (!activeQuote) return
    setIsSaving(true)
    try {
      // Secure local text sanitization using DOMPurify
      const sanitizedEmail = DOMPurify.sanitize(emailText)
      
      await updateQuote(activeQuote.id, {
        material_cost: materialCost,
        labor_cost: laborCost,
        total_cost: totalCost,
        email_draft: sanitizedEmail,
      })
      showSuccess("Draft Saved", "Draft override changes saved successfully!")
    } catch (err: any) {
      showError("Save Failed", `Failed to save draft changes: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDispatch = async () => {
    if (!activeQuote || !activeLead) return
    try {
      // 1. Dispatch in backend (DB status update & SMTP send if email exists)
      await dispatchQuote(activeQuote.id)
      
      // 2. Detect if an email address is present in the lead text
      const emailRegex = /[\w\.-]+@[\w\.-]+\.\w+/
      const match = activeLead.raw_text.match(emailRegex)
      const customerEmail = match ? match[0] : null
      
      if (customerEmail) {
        showSuccess("Quote Dispatched", `Quotation successfully dispatched and emailed to ${customerEmail}!`)
      } else {
        // If there is no email address, copy result to clipboard
        await navigator.clipboard.writeText(emailText)
        setIsCopied(true)
        setTimeout(() => setIsCopied(false), 4000)
        showSuccess("Quote Dispatched", "No recipient email found. Quotation email draft has been copied to your clipboard!")
      }
      
      // Refresh leads queue
      await fetchLeads()
    } catch (err: any) {
      showError("Dispatch Failed", `Failed to dispatch quote: ${err.message}`)
    }
  }

  const handleReimport = async () => {
    if (!activeLead) return
    showConfirm(
      "Re-import Lead", 
      "Are you sure you want to import this lead again? This will reset its status to pending and clear existing drafts.",
      async () => {
        try {
          await reimportLead(activeLead.id)
        } catch (err: any) {
          showError("Re-import Failed", `Failed to reimport lead: ${err.message}`)
        }
      }
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-950 text-slate-100 relative">
      
      {/* LEFT PANEL: Ingestion feeds queue */}
      <div className="w-1/3 border-r border-slate-800/80 bg-slate-900/10 flex flex-col">
        <div className="p-6 border-b border-slate-800/80 bg-slate-900/20">
          <h2 className="text-lg font-bold font-outfit text-white">Pipeline Feeds</h2>
          <p className="text-xs text-slate-500 mt-1">Select an ingested lead to process cost estimations.</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {leads.length === 0 ? (
            <div className="py-20 text-center text-slate-600">
              <Mail className="w-10 h-10 mx-auto mb-2 text-slate-800" />
              <p className="text-sm">Queue is currently empty</p>
            </div>
          ) : (
            leads.map((lead) => {
              const isSelected = activeLead?.id === lead.id
              return (
                <button
                  key={lead.id}
                  onClick={() => setActiveLead(lead)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-300 ${
                    isSelected
                      ? 'bg-brand-500/10 border-brand-500/50 shadow-glow-sm'
                      : 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-900/60'
                  }`}
                >
                  <p className="font-semibold text-slate-200 text-sm truncate">{lead.title}</p>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{lead.raw_text}</p>
                  <div className="flex items-center justify-between gap-2 mt-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        lead.status === 'processed' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : lead.status === 'dispatched'
                          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                      }`}>
                        {lead.status}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {lead.status === 'dispatched' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          showConfirm(
                            "Delete Dispatched Lead", 
                            "Are you sure you want to delete this dispatched lead? This action cannot be undone.",
                            () => deleteLead(lead.id)
                          )
                        }}
                        className="p-1 hover:bg-red-500/20 border border-transparent hover:border-red-500/35 text-red-400 hover:text-red-300 rounded transition-all cursor-pointer"
                        title="Delete Dispatched Lead"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Processing Workspace */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        {activeLead ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header Workspace */}
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/20 shrink-0">
              <div>
                <h3 className="text-lg font-bold font-outfit text-white truncate max-w-md">{activeLead.title}</h3>
                <p className="text-xs text-slate-400">Tenant pipeline workspace</p>
              </div>
              
              <div className="flex items-center gap-3">
                {(activeLead.status === 'processed' || activeLead.status === 'dispatched') && (
                  <button
                    onClick={handleReimport}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-750 font-medium px-4 py-2.5 rounded-lg transition-all text-sm shrink-0 cursor-pointer"
                  >
                    Import Lead Again
                  </button>
                )}

                {!activeQuote && (
                  <button
                    onClick={handleRunAi}
                    disabled={aiProcessing}
                    className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg shadow-glow-sm disabled:bg-brand-500/30 disabled:cursor-not-allowed transition-all text-sm shrink-0 cursor-pointer"
                  >
                    {aiProcessing ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        AXRFLOWS Processing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-glow" />
                        Run AXRFLOWS AI Engine
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Error alerts */}
            {error && (
              <div className="mx-6 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Content Workspace Splitter */}
            <div className="flex-1 flex overflow-hidden">
              
              {/* Left Column: Lead Information & Breakdown View */}
              <div className="w-1/2 p-6 overflow-y-auto border-r border-slate-800 flex flex-col gap-6">
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/10 p-5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 font-outfit">Lead Source Context</h4>
                  <div className="bg-slate-950 border border-slate-800/60 p-4 rounded-lg text-slate-300 text-xs font-mono leading-relaxed whitespace-pre-wrap select-all">
                    {activeLead.raw_text}
                  </div>
                </div>

                {activeQuote && (
                  <div className="rounded-xl border border-slate-800/80 bg-slate-900/10 p-5 flex flex-col gap-5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-outfit">Breakdown & Override Workspace</h4>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Material Cost ($)</label>
                        <input
                          type="number"
                          value={materialCost}
                          onChange={(e) => handleCostChange('material', Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3.5 py-2.5 text-sm text-slate-200 outline-none font-mono transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Labor/Machine Cost ($)</label>
                        <input
                          type="number"
                          value={laborCost}
                          onChange={(e) => handleCostChange('labor', Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3.5 py-2.5 text-sm text-slate-200 outline-none font-mono transition-all"
                        />
                      </div>
                    </div>

                    <div className="border-t border-slate-850 pt-4 flex justify-between items-center">
                      <span className="text-sm font-semibold text-slate-400">Total Calculated Cost</span>
                      <span className="text-xl font-bold font-outfit text-indigo-400 font-mono">${totalCost.toFixed(2)}</span>
                    </div>

                    {activeQuote.itemized_breakdown && (
                      <div className="border-t border-slate-850 pt-4">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Itemized Quotation Costs</label>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {activeQuote.itemized_breakdown.map((item: ItemizedCost, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-xs p-2.5 bg-slate-950 border border-slate-900 rounded-lg">
                              <span className="text-slate-300 font-medium">{item.description}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 font-mono">x{item.quantity}</span>
                                <span className="font-semibold text-slate-200 font-mono">${Number(item.total_price).toFixed(2)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: AI Response Email Composer */}
              {activeQuote && (
                <div className="w-1/2 p-6 flex flex-col justify-between overflow-hidden bg-slate-950">
                  <div className="flex-1 flex flex-col overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/10 p-5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 font-outfit shrink-0">Corporate Response Composer</h4>
                    <div className="flex-1 overflow-hidden relative border border-slate-850 rounded-lg bg-slate-950">
                      <textarea
                        value={emailText}
                        onChange={(e) => setEmailText(e.target.value)}
                        className="absolute inset-0 w-full h-full p-4 text-xs font-mono text-slate-300 bg-transparent resize-none outline-none leading-relaxed"
                      />
                    </div>
                  </div>

                  <div className="mt-4 shrink-0 flex flex-col gap-3">
                    <div className="flex gap-3">
                      <button
                        onClick={handleSaveDraft}
                        disabled={isSaving}
                        className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Saving Changes...' : 'Save Draft Settings'}
                      </button>

                      <button
                        onClick={handleDispatch}
                        disabled={activeQuote.status === 'dispatched'}
                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                      >
                        {activeQuote.status === 'dispatched' ? (
                          <>
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            Dispatched & Copied
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Approve & Dispatch
                          </>
                        )}
                      </button>
                    </div>

                    {isCopied && (
                      <div className="text-center text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/15 py-2 rounded-lg animate-pulse">
                        Email draft copied to clipboard! Ready to copy-paste to your email client.
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-grid">
            <Mail className="w-16 h-16 text-slate-800 mb-4 animate-bounce" />
            <h3 className="text-xl font-bold font-outfit text-slate-300">Workspace Vacant</h3>
            <p className="text-sm text-slate-500 max-w-sm mt-1">Select an incoming lead from the left feed channel to initialize cost breakdowns and B2B emails.</p>
          </div>
        )}
      </div>

      {/* Custom Reusable Dialog Modal */}
      {dialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm transition-all duration-300">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setDialog(prev => ({ ...prev, isOpen: false }))}
              className="absolute top-4 right-4 p-1 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div>
              <h3 className={`text-lg font-bold font-outfit ${
                dialog.type === 'error' ? 'text-red-400' :
                dialog.type === 'success' ? 'text-emerald-400' :
                dialog.type === 'confirm' ? 'text-amber-400' : 'text-indigo-400'
              }`}>
                {dialog.title}
              </h3>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                {dialog.message}
              </p>
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-2 shrink-0">
              {dialog.type === 'confirm' ? (
                <>
                  <button
                    onClick={() => setDialog(prev => ({ ...prev, isOpen: false }))}
                    className="px-4 py-2 border border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (dialog.onConfirm) dialog.onConfirm()
                      setDialog(prev => ({ ...prev, isOpen: false }))
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-lg hover:shadow-indigo-500/20"
                  >
                    Confirm Action
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setDialog(prev => ({ ...prev, isOpen: false }))}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-all cursor-pointer border border-slate-700"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
