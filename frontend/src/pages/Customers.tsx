import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, FilePlus, Loader2, Plus, Search, Trash, UserPlus, Users, X } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { useWorkspaceStore, CustomerSummary, CustomerHistory, CustomerInput } from '../store/workspaceStore'

const formatMoney = (value: number, currency = 'USD') => {
  try {
    return value.toLocaleString(undefined, { style: 'currency', currency })
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { dateStyle: 'medium' }) : '—')

const outcomeBadge = (status: string, outcome: string | null) =>
  status !== 'dispatched'
    ? { className: 'badge badge-neutral', label: 'Draft' }
    : outcome === 'accepted'
    ? { className: 'badge badge-success', label: 'Won' }
    : outcome === 'declined'
    ? { className: 'badge badge-danger', label: 'Lost' }
    : { className: 'badge badge-accent', label: 'Open' }

export const Customers: React.FC = () => {
  const navigate = useNavigate()
  const {
    customers, loadingCustomers, fetchCustomers, fetchCustomerHistory, leads, fetchLeads, setActiveLead,
    addCustomer, deleteCustomer, runAiEngine,
  } = useWorkspaceStore()
  const [search, setSearch] = useState('')
  // Add-customer dialog: null when closed; 'new' or the customer a new quote is for.
  const [formFor, setFormFor] = useState<'new' | CustomerSummary | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<CustomerSummary | null>(null)
  const [history, setHistory] = useState<CustomerHistory | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    fetchCustomers()
    fetchLeads()
  }, [fetchCustomers, fetchLeads])

  useEffect(() => {
    if (!selected) {
      setHistory(null)
      return
    }
    let cancelled = false
    setLoadingHistory(true)
    setHistory(null)
    fetchCustomerHistory(selected.key)
      .then((data) => {
        if (!cancelled) setHistory(data)
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected, fetchCustomerHistory])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return customers
    return customers.filter((c) =>
      [c.name, c.email, c.company, c.phone].some((v) => (v || '').toLowerCase().includes(term))
    )
  }, [customers, search])

  const handleSaved = async (leadId: string | null, draftNow: boolean, name: string, updated: boolean) => {
    setFormFor(null)
    if (leadId && draftNow) {
      const lead = useWorkspaceStore.getState().leads.find((l) => l.id === leadId)
      if (lead) {
        await setActiveLead(lead)
        runAiEngine(leadId).catch(() => {}) // progress and errors show in the pipeline
        navigate('/workspace')
        return
      }
    }
    setNotice(
      leadId
        ? `${name} saved. Their request is in the pipeline, ready to price.`
        : `${name} ${updated ? 'updated' : 'added'}.`
    )
  }

  const handleDelete = async (c: CustomerSummary) => {
    if (!c.id || !window.confirm(`Remove ${c.name || c.email} from your customers? Their quotes are kept.`)) return
    await deleteCustomer(c.id)
    setSelected(null)
  }

  const openQuote = async (leadId: string | null) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    await setActiveLead(lead)
    navigate('/workspace')
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <PageHeader
        title="Customers"
        description="Everyone you have quoted, with what they were charged before."
        actions={
          <button onClick={() => setFormFor('new')} className="btn btn-primary">
            <UserPlus className="w-4 h-4" />
            Add customer
          </button>
        }
      />

      {notice && (
        <div className="px-6 py-2.5 border-b border-slate-800 flex items-center justify-between gap-4 text-sm text-slate-300 bg-slate-900/40">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="btn-icon h-7 w-7 border-transparent" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Directory */}
        <section className={`${selected ? 'hidden lg:flex lg:w-1/2 xl:w-3/5' : 'flex w-full'} flex-col overflow-hidden border-r border-slate-800`}>
          <div className="px-6 py-3 border-b border-slate-800 shrink-0">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email or company"
                aria-label="Search customers"
                className="input pl-9"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingCustomers && customers.length === 0 ? (
              <div className="py-20 flex items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading customers
              </div>
            ) : customers.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No customers yet"
                description="Customers appear here once a quote has a customer name or email on it, or when you add someone who came in or called."
                className="py-20"
              />
            ) : filtered.length === 0 ? (
              <p className="px-6 py-10 text-sm text-slate-500">No customers match "{search}".</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-950">
                  <tr className="border-b border-slate-800 text-xs text-slate-400 whitespace-nowrap">
                    <th className="px-6 py-2.5 font-medium">Customer</th>
                    <th className="px-3 py-2.5 font-medium text-right">Quotes</th>
                    <th className="px-3 py-2.5 font-medium text-right">Win rate</th>
                    <th className="px-3 py-2.5 font-medium text-right">Won value</th>
                    <th className="px-6 py-2.5 font-medium text-right">Last quote</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filtered.map((c) => (
                    <tr
                      key={c.key}
                      onClick={() => setSelected(c)}
                      className={`cursor-pointer transition-colors ${selected?.key === c.key ? 'bg-slate-800/70' : 'hover:bg-slate-850'}`}
                    >
                      <td className="px-6 py-3 min-w-0">
                        <button className="block text-left cursor-pointer" onClick={() => setSelected(c)}>
                          <span className="block font-medium text-slate-100 truncate max-w-[280px]">
                            {c.name || c.email}
                            {c.id && c.quotes === 0 && <span className="ml-2 badge badge-neutral">Not quoted yet</span>}
                          </span>
                          <span className="block text-xs text-slate-500 truncate max-w-[280px]">
                            {[c.company, c.name ? c.email : null, c.phone].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-300">{c.sent}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-300">{c.win_rate != null ? `${c.win_rate}%` : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-100">{formatMoney(c.won_value, c.currency)}</td>
                      <td className="px-6 py-3 text-right text-slate-400 whitespace-nowrap">{day(c.last_activity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Detail */}
        {selected && (
          <section className="flex-1 min-w-0 flex flex-col overflow-hidden" aria-label="Customer history">
            <div className="h-16 px-6 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-slate-50">{selected.name || selected.email}</h2>
                <p className="truncate text-xs text-slate-500">
                  {[selected.company, selected.email, selected.phone].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setFormFor(selected)} className="btn btn-secondary btn-sm">
                  <FilePlus className="w-4 h-4" />
                  New quote
                </button>
                {selected.id && selected.quotes === 0 && (
                  <button onClick={() => handleDelete(selected)} className="btn-icon h-8 w-8 border-transparent text-red-400" aria-label="Remove customer">
                    <Trash className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="btn-icon h-8 w-8 border-transparent" aria-label="Close customer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {selected.notes && (
                <div className="card p-4">
                  <p className="text-xs font-medium text-slate-400">Notes</p>
                  <p className="mt-1.5 text-sm text-slate-200 whitespace-pre-line">{selected.notes}</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4">
                <div className="card p-4">
                  <p className="text-xs font-medium text-slate-400">Quoted</p>
                  <p className="mt-1.5 text-xl font-semibold text-slate-50 tabular-nums">{formatMoney(selected.quoted_value, selected.currency)}</p>
                  <p className="mt-1 text-xs text-slate-500">{selected.sent} sent, {selected.open} open</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs font-medium text-slate-400">Won</p>
                  <p className="mt-1.5 text-xl font-semibold text-slate-50 tabular-nums">{formatMoney(selected.won_value, selected.currency)}</p>
                  <p className="mt-1 text-xs text-slate-500">{selected.won} won, {selected.lost} lost</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs font-medium text-slate-400">Win rate</p>
                  <p className="mt-1.5 text-xl font-semibold text-slate-50 tabular-nums">{selected.win_rate != null ? `${selected.win_rate}%` : '—'}</p>
                  <p className="mt-1 text-xs text-slate-500">Last quote {day(selected.last_activity)}</p>
                </div>
              </div>

              {loadingHistory && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading history
                </div>
              )}

              {history && (
                <>
                  <div>
                    <h3 className="section-title mb-2">Price history</h3>
                    {history.price_history.length === 0 ? (
                      <p className="text-sm text-slate-500">No priced items have been sent to this customer yet.</p>
                    ) : (
                      <div className="card overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-800 text-xs text-slate-500">
                              <th className="px-4 py-2.5 text-left font-medium">Item</th>
                              <th className="px-4 py-2.5 text-right font-medium">Latest unit price</th>
                              <th className="px-4 py-2.5 text-left font-medium">Earlier</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {history.price_history.map((item) => (
                              <tr key={item.description}>
                                <td className="px-4 py-2.5 text-slate-200">{item.description}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-slate-100 whitespace-nowrap">
                                  {formatMoney(item.prices[0].unit_price, selected.currency)}
                                  <span className="block text-xs text-slate-500">{day(item.prices[0].date)}</span>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-slate-400 tabular-nums">
                                  {item.prices.length > 1
                                    ? item.prices.slice(1, 4).map((p) => `${formatMoney(p.unit_price, selected.currency)} (${day(p.date)})`).join(', ')
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="section-title mb-2">Quotes</h3>
                    {history.quotes.length === 0 && (
                      <p className="text-sm text-slate-500">No quotes yet. Use New quote to price what they asked for.</p>
                    )}
                    <ul className="card divide-y divide-slate-800">
                      {history.quotes.map((q) => {
                        const badge = outcomeBadge(q.status, q.outcome)
                        const canOpen = leads.some((l) => l.id === q.lead_id)
                        return (
                          <li key={q.id}>
                            <button
                              onClick={() => openQuote(q.lead_id)}
                              disabled={!canOpen}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-slate-850"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-slate-100 tabular-nums">{q.quote_number || 'Quote'}</span>
                                <span className="block truncate text-xs text-slate-500">
                                  {day(q.date)} · {q.items.map((i) => i.description).join(', ') || 'No line items'}
                                </span>
                              </span>
                              <span className={badge.className}>{badge.label}</span>
                              <span className="w-28 text-right text-sm tabular-nums text-slate-100">{formatMoney(q.total, q.currency)}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>

      {formFor && (
        <CustomerForm
          initial={formFor === 'new' ? null : formFor}
          onClose={() => setFormFor(null)}
          onSave={async (data, draftNow) => {
            const result = await addCustomer(data)
            await handleSaved(result.lead?.id ?? null, draftNow, data.name, result.updated)
          }}
        />
      )}
    </div>
  )
}

interface CustomerFormProps {
  // The customer a new quote is for; null adds a new customer.
  initial: CustomerSummary | null
  onClose: () => void
  onSave: (data: CustomerInput, draftNow: boolean) => Promise<void>
}

// Add someone who came in or called, and optionally what they want priced.
const CustomerForm: React.FC<CustomerFormProps> = ({ initial, onClose, onSave }) => {
  const [name, setName] = useState(initial?.name || '')
  const [company, setCompany] = useState(initial?.company || '')
  const [phone, setPhone] = useState(initial?.phone || '')
  const [email, setEmail] = useState(initial?.email || '')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [request, setRequest] = useState('')
  const [draftNow, setDraftNow] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const forQuote = initial !== null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (forQuote && !request.trim()) {
      setError('Describe what they want priced.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(
        { name, company, phone, email, notes, request: request.trim() || undefined },
        draftNow && !!request.trim()
      )
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="customer-form-title" className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 shadow-popover">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-800">
          <div>
            <h2 id="customer-form-title" className="text-base font-semibold text-slate-50">
              {forQuote ? `New quote for ${initial?.name || initial?.email}` : 'Add customer'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {forQuote
                ? 'For a request taken in person or by phone.'
                : 'Someone who came in or called. Add what they asked for to price it now, or leave it blank.'}
            </p>
          </div>
          <button onClick={onClose} className="btn-icon h-8 w-8 border-transparent -mr-1" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cust-name" className="label">Name</label>
              <input id="cust-name" required autoFocus={!forQuote} value={name} onChange={(e) => setName(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="cust-company" className="label">Company (optional)</label>
              <input id="cust-company" value={company} onChange={(e) => setCompany(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="cust-phone" className="label">Phone</label>
              <input id="cust-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+971 50 123 4567" className="input" />
            </div>
            <div>
              <label htmlFor="cust-email" className="label">Email</label>
              <input id="cust-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
            </div>
          </div>

          {!forQuote && (
            <div>
              <label htmlFor="cust-notes" className="label">Notes (optional)</label>
              <textarea id="cust-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. prefers pickup, pays cash on delivery" className="input resize-none" />
            </div>
          )}

          <div>
            <label htmlFor="cust-request" className="label">What do they want priced?{forQuote ? '' : ' (optional)'}</label>
            <textarea
              id="cust-request"
              rows={5}
              autoFocus={forQuote}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="e.g. 20 brackets, 6 mm mild steel, galvanised, 150 x 100 mm, delivery to Al Quoz"
              className="input resize-none leading-6"
            />
          </div>

          {request.trim() && (
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={draftNow} onChange={(e) => setDraftNow(e.target.checked)} />
              Draft the quote with AI now and open it
            </label>
          )}

          {error && (
            <div className="alert alert-error" role="alert">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {request.trim() ? (draftNow ? 'Save and draft quote' : 'Save and add to pipeline') : 'Save customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Customers
