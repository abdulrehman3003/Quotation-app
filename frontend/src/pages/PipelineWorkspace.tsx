import React, { useEffect, useMemo, useState } from 'react'
import { useWorkspaceStore, ItemizedCost, Quote, DispatchOptions, CustomerHistory } from '../store/workspaceStore'
import {
  AlertTriangle, Check, Copy, ExternalLink, Eye, FileText, Inbox, Plus, RotateCcw, Ruler, Save, Send,
  Sparkles, ThumbsDown, ThumbsUp, Trash2, X,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

type Category = 'material' | 'labor' | 'other'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const clampPct = (n: number) => Math.min(Math.max(Number.isFinite(n) ? n : 0, 0), 100)

// Mirrors backend/app/services/pricing.py so the screen matches what the server stores.
const computeTotals = (items: ItemizedCost[], discountPct: number, taxPct: number) => {
  const line = (i: ItemizedCost) => round2((Number(i.quantity) || 0) * (Number(i.unit_price) || 0))
  const sum = (cat?: Category) =>
    round2(items.filter((i) => !cat || i.category === cat).reduce((acc, i) => acc + line(i), 0))
  const subtotal = sum()
  const discount = round2((subtotal * clampPct(discountPct)) / 100)
  const tax = round2(((subtotal - discount) * clampPct(taxPct)) / 100)
  return { material: sum('material'), labor: sum('labor'), subtotal, discount, tax, total: round2(subtotal - discount + tax) }
}

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
    setQuoteOutcome,
    uploadPartFile,
    fetchCustomerHistory,
    reimportLead,
    deleteLead,
    aiProcessing,
    error,
  } = useWorkspaceStore()

  const [emailText, setEmailText] = useState('')
  const [items, setItems] = useState<ItemizedCost[]>([])
  const [discountPct, setDiscountPct] = useState(0)
  const [taxPct, setTaxPct] = useState(0)
  const [validUntil, setValidUntil] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isMeasuring, setIsMeasuring] = useState(false)
  const [customerHistory, setCustomerHistory] = useState<CustomerHistory | null>(null)
  const partFileInput = React.useRef<HTMLInputElement>(null)

  // What this customer was quoted before, so prices stay consistent
  const historyKey = (activeQuote?.customer_email || '').trim().toLowerCase()
  useEffect(() => {
    setCustomerHistory(null)
    if (!historyKey) return
    let cancelled = false
    fetchCustomerHistory(historyKey).then((data) => {
      if (!cancelled) setCustomerHistory(data)
    })
    return () => {
      cancelled = true
    }
  }, [historyKey, fetchCustomerHistory])

  const handlePartFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !activeLead) return
    setIsMeasuring(true)
    try {
      await uploadPartFile(activeLead.id, file)
    } catch (err: any) {
      showError("Couldn't measure the part file", err.message)
    } finally {
      setIsMeasuring(false)
    }
  }

  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'confirm' | 'info';
    confirmLabel?: string;
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

  const showConfirm = (title: string, message: string, onConfirm: () => void, confirmLabel?: string) => {
    setDialog({ isOpen: true, title, message, type: 'confirm', onConfirm, confirmLabel })
  }

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  // Load the editable copy whenever a different quote (or a saved version of it) arrives
  useEffect(() => {
    setEmailText(activeQuote?.email_draft || '')
    setItems((activeQuote?.itemized_breakdown || []).map((i) => ({ ...i, category: i.category || 'material' })))
    setDiscountPct(Number(activeQuote?.discount_percent || 0))
    setTaxPct(Number(activeQuote?.tax_percent || 0))
    setValidUntil(activeQuote?.valid_until || '')
    setCustomerName(activeQuote?.customer_name || '')
    // Drafts created before recipients were stored: suggest the first address in the request.
    const suggested = activeQuote && activeQuote.status !== 'dispatched'
      ? useWorkspaceStore.getState().activeLead?.raw_text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0]
      : ''
    setCustomerEmail(activeQuote?.customer_email || suggested || '')
    setDirty(false)
    setNotice('')
  }, [activeQuote])

  const isDispatched = activeQuote?.status === 'dispatched'
  const currency = activeQuote?.currency || 'USD'
  // Quotes created before line items existed keep their stored figures.
  const hasItems = items.length > 0
  const totals = useMemo(() => computeTotals(items, discountPct, taxPct), [items, discountPct, taxPct])
  const displayTotal = hasItems ? totals.total : Number(activeQuote?.total_cost || 0)
  const unpricedCount = items.filter((i) => round2((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)) === 0).length
  const reviewNotes = (activeQuote?.review_notes || []).filter(
    (n) => unpricedCount > 0 || !n.startsWith('No price found')
  )

  const money = (value: number) => {
    try {
      return value.toLocaleString(undefined, { style: 'currency', currency })
    } catch {
      return `${value.toFixed(2)} ${currency}`
    }
  }

  const edit = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value)
    setDirty(true)
  }

  const updateItem = (index: number, patch: Partial<ItemizedCost>) => {
    // Typing a price or quantity is the person confirming it, so the "confirm" flag goes away.
    const confirms = 'unit_price' in patch || 'quantity' in patch
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch, ...(confirms ? { needs_review: false } : {}) } : item)))
    setDirty(true)
  }

  const addItem = () => {
    setItems((prev) => [...prev, { description: '', quantity: 1, unit_price: 0, total_price: 0, category: 'material' }])
    setDirty(true)
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
    setDirty(true)
  }

  const handleRunAi = async () => {
    if (!activeLead) return
    try {
      await runAiEngine(activeLead.id)
    } catch (err) {
      console.error(err)
    }
  }

  const buildUpdates = (): Partial<Quote> => {
    const updates: Partial<Quote> = {
      email_draft: emailText,
      discount_percent: clampPct(discountPct),
      tax_percent: clampPct(taxPct),
      customer_name: customerName,
      customer_email: customerEmail.trim(),
    }
    if (validUntil) updates.valid_until = validUntil
    // Only send line items when there are some: an empty list must not wipe the
    // stored figures of a legacy quote that never had line items.
    if (hasItems || (activeQuote?.itemized_breakdown || []).length > 0) {
      updates.itemized_breakdown = items
        .filter((i) => i.description.trim() || Number(i.unit_price) > 0)
        .map((i) => ({
          description: i.description.trim() || 'Item',
          quantity: Number(i.quantity) || 0,
          unit_price: Number(i.unit_price) || 0,
          total_price: round2((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)),
          category: i.category || 'material',
          needs_review: !!i.needs_review,
        }))
    }
    return updates
  }

  const handleSaveDraft = async () => {
    if (!activeQuote || isDispatched) return
    setIsSaving(true)
    try {
      await updateQuote(activeQuote.id, buildUpdates())
      setNotice('Draft saved.')
    } catch (err: any) {
      showError("Couldn't save the draft", err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  const send = async (options: DispatchOptions = {}) => {
    if (!activeQuote || !activeLead) return
    const quoteId = activeQuote.id
    setIsSending(true)
    try {
      if (dirty) await updateQuote(quoteId, buildUpdates())
      const sent = await dispatchQuote(quoteId, options)
      if (sent.delivery === 'email') {
        showSuccess('Quote sent', `Quote ${sent.quote_number || ''} was emailed to ${sent.sent_to}.`.replace('  ', ' '))
      } else {
        const copied = await copyText(emailText)
        showSuccess(
          'Quote marked as sent',
          copied
            ? 'Nothing was emailed. The reply was copied to your clipboard so you can deliver it yourself.'
            : 'Nothing was emailed. Copy the reply text and deliver it yourself.'
        )
      }
      await fetchLeads()
    } catch (err: any) {
      if (err.code === 'unpriced_items') {
        showConfirm('Some items have no price', `${err.message}`, () => send({ ...options, confirm_unpriced: true }), 'Send anyway')
      } else if (err.code === 'no_mailbox') {
        showConfirm(
          'No mailbox connected',
          'The quote was not emailed because Gmail is not connected in Settings. Mark it as sent and copy the reply so you can deliver it yourself?',
          () => send({ ...options, mode: 'manual' }),
          'Mark as sent'
        )
      } else if (err.code === 'no_recipient') {
        showError('No customer email', 'Add the customer\'s email address under "Send to", then send again.')
      } else {
        showError("Couldn't send the quote", err.message)
      }
    } finally {
      setIsSending(false)
    }
  }

  const handleDispatch = () => {
    if (!customerEmail.trim()) {
      showConfirm(
        'No customer email',
        'There is no email address for this customer, so nothing will be emailed. Mark the quote as sent and copy the reply to deliver it yourself?',
        () => send({ mode: 'manual' }),
        'Mark as sent'
      )
      return
    }
    send()
  }

  const handleOutcome = async (outcome: 'accepted' | 'declined' | null) => {
    if (!activeQuote) return
    try {
      await setQuoteOutcome(activeQuote.id, outcome)
    } catch (err: any) {
      showError("Couldn't update the quote", err.message)
    }
  }

  const handleReimport = async () => {
    if (!activeLead) return
    showConfirm(
      isDispatched ? 'Revise this quote?' : 'Start over?',
      isDispatched
        ? 'The lead goes back to New so you can generate a revised quote. The quote you already sent stays in your reports.'
        : 'This resets the lead to New and discards the current draft.',
      async () => {
        try {
          await reimportLead(activeLead.id)
        } catch (err: any) {
          showError("Couldn't start over", err.message)
        }
      }
    )
  }

  const leadBadge = (status: string) =>
    status === 'processed'
      ? { className: 'badge badge-success', label: 'Quoted' }
      : status === 'dispatched'
      ? { className: 'badge badge-accent', label: 'Sent' }
      : status === 'failed'
      ? { className: 'badge badge-danger', label: 'Failed' }
      : { className: 'badge badge-warning', label: 'New' }

  const customerLink = activeQuote?.public_token ? `${window.location.origin}/q/${activeQuote.public_token}` : ''

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
      <PageHeader title="Pipeline" description="Price a request, review the draft, then send the quote." />

      <div className="flex-1 flex overflow-hidden">
        {/* Lead list */}
        <section className="w-[320px] shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/40" aria-label="Leads">
          <div className="h-11 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
            <span className="text-xs font-medium text-slate-400">Leads</span>
            <span className="text-xs text-slate-500 tabular-nums">{leads.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {leads.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No leads to price"
                description="Add a lead from the dashboard, or bring one in from Email or WhatsApp."
              />
            ) : (
              <ul className="divide-y divide-slate-800">
                {leads.map((lead) => {
                  const isSelected = activeLead?.id === lead.id
                  const badge = leadBadge(lead.status)
                  return (
                    <li key={lead.id} className="relative group">
                      <button
                        data-testid="list-item"
                        onClick={() => setActiveLead(lead)}
                        aria-current={isSelected}
                        className={`relative w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                          isSelected ? 'bg-slate-800/70' : 'hover:bg-slate-850'
                        }`}
                      >
                        {isSelected && <span className="absolute inset-y-0 left-0 w-0.5 bg-brand-500" />}
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-slate-100">{lead.title}</p>
                          <span className={`${badge.className} shrink-0`}>{badge.label}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 line-clamp-2">{lead.raw_text}</p>
                        <p className="mt-1.5 text-xs text-slate-500">
                          <span className="capitalize">{lead.source}</span>
                          {' · '}
                          {new Date(lead.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </p>
                      </button>
                      {lead.status === 'dispatched' && (
                        <button
                          onClick={() =>
                            showConfirm(
                              'Delete this lead?',
                              'The lead and its sent quote will be removed. This can\'t be undone.',
                              () => deleteLead(lead.id)
                            )
                          }
                          className="absolute bottom-2.5 right-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer"
                          aria-label={`Delete ${lead.title}`}
                          title="Delete lead"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Workspace */}
        <section className="flex-1 min-w-0 flex flex-col overflow-hidden" aria-label="Quote">
          {activeLead ? (
            <>
              <div className="h-16 px-6 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-slate-50">{activeLead.title}</h2>
                  <p className="text-xs text-slate-500">
                    <span className="capitalize">{activeLead.source}</span>
                    {' · '}
                    {new Date(activeLead.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    {activeQuote?.quote_number && <>{' · '}<span className="tabular-nums">{activeQuote.quote_number}</span></>}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {(activeLead.status === 'processed' || activeLead.status === 'dispatched') && (
                    <button onClick={handleReimport} className="btn btn-secondary">
                      <RotateCcw className="w-4 h-4" />
                      {isDispatched ? 'Revise' : 'Start over'}
                    </button>
                  )}

                  {!activeQuote && (
                    <button onClick={handleRunAi} disabled={aiProcessing} className="btn btn-primary">
                      {aiProcessing ? (
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      {aiProcessing ? 'Pricing request' : 'Generate quote'}
                    </button>
                  )}
                </div>
              </div>

              {error && (
                <div className="alert alert-error mx-6 mt-4" role="alert">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex-1 flex overflow-hidden">
                {/* Request + costs */}
                <div className={`${activeQuote ? 'w-3/5 border-r border-slate-800' : 'w-full'} overflow-y-auto`}>
                  <div className={`p-6 space-y-6 ${activeQuote ? '' : 'max-w-3xl'}`}>
                    {activeQuote && isDispatched && (
                      <div className="card p-4 space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          {activeQuote.outcome === 'accepted' ? (
                            <span className="badge badge-success">Won</span>
                          ) : activeQuote.outcome === 'declined' ? (
                            <span className="badge badge-danger">Lost</span>
                          ) : (
                            <span className="badge badge-accent">Awaiting customer</span>
                          )}
                          <span className="text-slate-400">
                            Sent {new Date(activeQuote.sent_at || activeQuote.created_at).toLocaleDateString([], { dateStyle: 'medium' })}
                          </span>
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <Eye className="w-3.5 h-3.5" />
                            {activeQuote.view_count
                              ? `Opened ${activeQuote.view_count} time${activeQuote.view_count === 1 ? '' : 's'}`
                              : 'Not opened yet'}
                          </span>
                        </div>
                        {activeQuote.customer_comment && (
                          <p className="text-sm text-slate-300">
                            <span className="text-slate-500">Customer said: </span>
                            {activeQuote.customer_comment}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          {activeQuote.outcome !== 'accepted' && (
                            <button onClick={() => handleOutcome('accepted')} className="btn btn-secondary btn-sm">
                              <ThumbsUp className="w-3.5 h-3.5" /> Mark won
                            </button>
                          )}
                          {activeQuote.outcome !== 'declined' && (
                            <button onClick={() => handleOutcome('declined')} className="btn btn-secondary btn-sm">
                              <ThumbsDown className="w-3.5 h-3.5" /> Mark lost
                            </button>
                          )}
                          {activeQuote.outcome && (
                            <button onClick={() => handleOutcome(null)} className="btn btn-ghost btn-sm">Clear</button>
                          )}
                          {customerLink && (
                            <button
                              onClick={async () => setNotice((await copyText(customerLink)) ? 'Customer link copied.' : customerLink)}
                              className="btn btn-ghost btn-sm"
                            >
                              <Copy className="w-3.5 h-3.5" /> Copy customer link
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="section-title mb-2">Customer request</h3>
                      <div className="card p-4 text-sm leading-6 text-slate-300 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                        {activeLead.raw_text}
                      </div>
                    </div>

                    {!activeQuote && !aiProcessing && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <input ref={partFileInput} type="file" accept=".dxf,.stl" className="hidden" onChange={handlePartFile} />
                          <button onClick={() => partFileInput.current?.click()} disabled={isMeasuring} className="btn btn-secondary btn-sm">
                            {isMeasuring ? (
                              <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Ruler className="w-3.5 h-3.5" />
                            )}
                            {isMeasuring ? 'Measuring' : 'Add part file (DXF or STL)'}
                          </button>
                          <span className="text-xs text-slate-500">
                            Measures cut length, pierces and blank size, or volume and surface area, and adds them to the request.
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          Generate a quote to price this request from your knowledge base. You can edit every figure before sending.
                        </p>
                      </div>
                    )}

                    {activeQuote && !isDispatched && reviewNotes.length > 0 && (
                      <div className="alert alert-warning" role="status">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium">Check before sending</p>
                          <ul className="mt-1 list-disc pl-4 space-y-0.5">
                            {reviewNotes.map((note, i) => (
                              <li key={i}>{note}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {activeQuote && (
                      <div>
                        <h3 className="section-title mb-2">Send to</h3>
                        <div className="card p-4 grid grid-cols-2 gap-4">
                          <div>
                            <label htmlFor="customer-name" className="label">Customer name</label>
                            <input
                              id="customer-name"
                              type="text"
                              value={customerName}
                              disabled={isDispatched}
                              onChange={(e) => edit(setCustomerName)(e.target.value)}
                              className="input"
                            />
                          </div>
                          <div>
                            <label htmlFor="customer-email" className="label">Customer email</label>
                            <input
                              id="customer-email"
                              type="email"
                              value={customerEmail}
                              disabled={isDispatched}
                              placeholder="No email found in the request"
                              onChange={(e) => edit(setCustomerEmail)(e.target.value)}
                              className="input"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {activeQuote && customerHistory && customerHistory.quotes.filter((q) => q.id !== activeQuote.id).length > 0 && (
                      <div>
                        <h3 className="section-title mb-2">Previously quoted to this customer</h3>
                        <div className="card divide-y divide-slate-800">
                          <p className="px-4 py-2.5 text-xs text-slate-400">
                            {customerHistory.customer.sent} sent, {customerHistory.customer.won} won, {customerHistory.customer.lost} lost
                          </p>
                          {customerHistory.price_history.slice(0, 5).map((item) => (
                            <div key={item.description} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                              <span className="min-w-0 truncate text-slate-300">{item.description}</span>
                              <span className="shrink-0 tabular-nums text-slate-100">
                                {money(item.prices[0].unit_price)}
                                <span className="ml-2 text-xs text-slate-500">
                                  {new Date(item.prices[0].date).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                                </span>
                              </span>
                            </div>
                          ))}
                          {customerHistory.price_history.length === 0 && (
                            <p className="px-4 py-2.5 text-xs text-slate-500">No priced items were sent to them yet.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {activeQuote && (
                      <div>
                        <h3 className="section-title mb-2">Costs</h3>
                        <div className="card overflow-hidden">
                          {hasItems && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-slate-800 text-xs text-slate-500">
                                    <th className="pl-5 pr-3 py-2.5 text-left font-medium">Item</th>
                                    <th className="pl-4 pr-2 py-2.5 text-left font-medium w-32">Type</th>
                                    <th className="pl-2 pr-4 py-2.5 text-right font-medium w-24">Qty</th>
                                    <th className="pl-2 pr-4 py-2.5 text-right font-medium w-32">Unit price</th>
                                    <th className="px-3 py-2.5 text-right font-medium w-36">Amount</th>
                                    {!isDispatched && <th className="w-9" />}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                  {items.map((item, idx) => {
                                    const amount = round2((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))
                                    return (
                                      <tr key={idx} className={amount === 0 || (item.needs_review && !isDispatched) ? 'bg-amber-500/5' : ''}>
                                        <td className="px-3 py-1.5">
                                          <input
                                            aria-label={`Item ${idx + 1} description`}
                                            value={item.description}
                                            title={item.description}
                                            disabled={isDispatched}
                                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                                            className="input input-sm"
                                          />
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <select
                                            aria-label={`Item ${idx + 1} type`}
                                            value={item.category || 'material'}
                                            disabled={isDispatched}
                                            onChange={(e) => updateItem(idx, { category: e.target.value as Category })}
                                            className="input input-sm"
                                          >
                                            <option value="material">Material</option>
                                            <option value="labor">Labour</option>
                                            <option value="other">Other</option>
                                          </select>
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <input
                                            aria-label={`Item ${idx + 1} quantity`}
                                            type="number"
                                            min={0}
                                            step="any"
                                            value={item.quantity}
                                            disabled={isDispatched}
                                            onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                                            className="input input-sm text-right tabular-nums"
                                          />
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <input
                                            aria-label={`Item ${idx + 1} unit price`}
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={item.unit_price}
                                            disabled={isDispatched}
                                            onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                                            className="input input-sm text-right tabular-nums"
                                          />
                                        </td>
                                        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                                          {amount === 0 ? (
                                            <span className="text-amber-300">Needs price</span>
                                          ) : item.needs_review && !isDispatched ? (
                                            <span className="text-slate-200" title="Estimated from a range or rule in your knowledge base. Edit the price to confirm it.">
                                              {money(amount)}
                                              <span className="block text-[11px] leading-4 text-amber-300">Confirm price</span>
                                            </span>
                                          ) : (
                                            <span className="text-slate-200">{money(amount)}</span>
                                          )}
                                        </td>
                                        {!isDispatched && (
                                          <td className="pr-2">
                                            <button
                                              onClick={() => removeItem(idx)}
                                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer"
                                              aria-label={`Remove item ${idx + 1}`}
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {!isDispatched && (
                            <div className="px-3 py-2 border-t border-slate-800">
                              <button onClick={addItem} className="btn btn-ghost btn-sm">
                                <Plus className="w-3.5 h-3.5" /> Add line item
                              </button>
                            </div>
                          )}

                          <div className="grid grid-cols-3 gap-4 p-4 border-t border-slate-800">
                            <div>
                              <label htmlFor="discount" className="label">Discount (%)</label>
                              <input
                                id="discount"
                                type="number"
                                min={0}
                                max={100}
                                step="0.01"
                                value={discountPct}
                                disabled={isDispatched || !hasItems}
                                onChange={(e) => edit(setDiscountPct)(Number(e.target.value))}
                                className="input tabular-nums"
                              />
                            </div>
                            <div>
                              <label htmlFor="tax" className="label">Tax (%)</label>
                              <input
                                id="tax"
                                type="number"
                                min={0}
                                max={100}
                                step="0.01"
                                value={taxPct}
                                disabled={isDispatched || !hasItems}
                                onChange={(e) => edit(setTaxPct)(Number(e.target.value))}
                                className="input tabular-nums"
                              />
                            </div>
                            <div>
                              <label htmlFor="valid-until" className="label">Valid until</label>
                              <input
                                id="valid-until"
                                type="date"
                                value={validUntil}
                                disabled={isDispatched}
                                onChange={(e) => edit(setValidUntil)(e.target.value)}
                                className="input tabular-nums"
                              />
                            </div>
                          </div>

                          {hasItems && (
                            <dl className="px-4 py-3 border-t border-slate-800 space-y-1 text-sm">
                              <div className="flex justify-between text-slate-400">
                                <dt>Materials</dt>
                                <dd className="tabular-nums">{money(totals.material)}</dd>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <dt>Labour and machine</dt>
                                <dd className="tabular-nums">{money(totals.labor)}</dd>
                              </div>
                              <div className="flex justify-between text-slate-300 pt-1">
                                <dt>Subtotal</dt>
                                <dd className="tabular-nums">{money(totals.subtotal)}</dd>
                              </div>
                              {totals.discount > 0 && (
                                <div className="flex justify-between text-slate-400">
                                  <dt>Discount</dt>
                                  <dd className="tabular-nums">−{money(totals.discount)}</dd>
                                </div>
                              )}
                              {totals.tax > 0 && (
                                <div className="flex justify-between text-slate-400">
                                  <dt>Tax</dt>
                                  <dd className="tabular-nums">{money(totals.tax)}</dd>
                                </div>
                              )}
                            </dl>
                          )}

                          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
                            <span className="text-sm text-slate-400">Total</span>
                            <span className="text-lg font-semibold text-slate-50 tabular-nums">{money(displayTotal)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reply draft */}
                {activeQuote && (
                  <div className="w-2/5 flex flex-col overflow-hidden">
                    <div className="flex-1 flex flex-col overflow-hidden p-6">
                      <label htmlFor="quote-email" className="section-title mb-2">Reply to customer</label>
                      <textarea
                        id="quote-email"
                        value={emailText}
                        readOnly={isDispatched}
                        onChange={(e) => edit(setEmailText)(e.target.value)}
                        className="input flex-1 resize-none leading-6"
                      />
                      {!isDispatched && dirty && hasItems && (
                        <p className="mt-2 text-xs text-amber-300">
                          You changed the figures. Make sure the prices written in this reply still match.
                        </p>
                      )}
                      {!isDispatched && customerLink && (
                        <p className="mt-2 text-xs text-slate-500">
                          A link to the online quote, where the customer can print or accept it, is added to the email.
                        </p>
                      )}
                    </div>

                    <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/40 shrink-0">
                      {notice && (
                        <div className="alert alert-success mb-3" role="status">
                          <Check className="w-4 h-4 mt-0.5 shrink-0" />
                          <p className="break-all">{notice}</p>
                        </div>
                      )}
                      <div className="flex items-center justify-end gap-2">
                        {customerLink && (
                          <a href={`${customerLink}?preview=1`} target="_blank" rel="noreferrer" className="btn btn-ghost mr-auto">
                            <ExternalLink className="w-4 h-4" />
                            Preview
                          </a>
                        )}
                        {!isDispatched && (
                          <button onClick={handleSaveDraft} disabled={isSaving || !dirty} className="btn btn-secondary">
                            <Save className="w-4 h-4" />
                            {isSaving ? 'Saving' : 'Save draft'}
                          </button>
                        )}
                        <button onClick={handleDispatch} disabled={isDispatched || isSending} className="btn btn-primary">
                          {isDispatched ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                          {isDispatched ? 'Quote sent' : isSending ? 'Sending' : 'Send quote'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={FileText}
                title="Select a lead"
                description="Choose a lead on the left to generate a quote and draft the reply."
              />
            </div>
          )}
        </section>
      </div>

      {/* Dialog */}
      {dialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 shadow-popover p-5">
            <div className="flex items-start justify-between gap-4">
              <h3 id="dialog-title" className="text-base font-semibold text-slate-50">{dialog.title}</h3>
              <button
                onClick={() => setDialog(prev => ({ ...prev, isOpen: false }))}
                className="btn-icon h-8 w-8 border-transparent shrink-0 -mt-1 -mr-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className={`mt-2 text-sm leading-6 ${dialog.type === 'error' ? 'text-red-300' : 'text-slate-300'}`}>
              {dialog.message}
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              {dialog.type === 'confirm' ? (
                <>
                  <button onClick={() => setDialog(prev => ({ ...prev, isOpen: false }))} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (dialog.onConfirm) dialog.onConfirm()
                      setDialog(prev => ({ ...prev, isOpen: false }))
                    }}
                    className="btn btn-primary"
                  >
                    {dialog.confirmLabel || 'Confirm'}
                  </button>
                </>
              ) : (
                <button onClick={() => setDialog(prev => ({ ...prev, isOpen: false }))} className="btn btn-secondary">
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
