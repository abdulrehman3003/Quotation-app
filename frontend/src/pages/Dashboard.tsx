import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore, Lead } from '../store/workspaceStore'
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock, Database, Globe, Inbox, Mail, MessageSquare,
  PenLine, Plus, Trash2, X, type LucideIcon,
  Store,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

const DAY_MS = 86_400_000
const ACTIVITY_DAYS = 14

const sourceIcon: Record<string, LucideIcon> = {
  email: Mail,
  whatsapp: MessageSquare,
  webhook: Globe,
  manual: PenLine,
  'walk-in': Store,
}

// Same wording as the pipeline so a lead never has two names for one state.
const leadStatus = (status: string) =>
  status === 'processed'
    ? { className: 'badge badge-success', label: 'Quoted' }
    : status === 'dispatched'
    ? { className: 'badge badge-accent', label: 'Sent' }
    : status === 'failed'
    ? { className: 'badge badge-danger', label: 'Failed' }
    : { className: 'badge badge-warning', label: 'New' }

const timeAgo = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} d ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const {
    leads,
    quotes,
    kbFiles,
    emails,
    emailConfigured,
    whatsappChats,
    userProfile,
    quoteAnalytics,
    fetchLeads,
    fetchQuotes,
    fetchKbFiles,
    fetchQuoteAnalytics,
    createLead,
    deleteLead,
    setActiveLead,
    loadingLeads,
    teamReminders,
    fetchTeamReminders,
  } = useWorkspaceStore()

  useEffect(() => {
    fetchTeamReminders()
  }, [fetchTeamReminders])

  const openReminder = async (leadId: string | null) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    await setActiveLead(lead)
    navigate('/workspace')
  }

  const [showNewLead, setShowNewLead] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newLeadTitle, setNewLeadTitle] = useState('')
  const [newLeadText, setNewLeadText] = useState('')
  const [formError, setFormError] = useState('')
  const [justAdded, setJustAdded] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [hoveredDay, setHoveredDay] = useState<number | null>(null)

  useEffect(() => {
    fetchLeads()
    fetchQuotes()
    fetchKbFiles()
    fetchQuoteAnalytics()
  }, [fetchLeads, fetchQuotes, fetchKbFiles, fetchQuoteAnalytics])

  useEffect(() => {
    if (!showNewLead) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNewLead(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showNewLead])

  const currency = userProfile?.default_quote_parameters?.currency || 'USD'
  const money = (value: number) => {
    try {
      return value.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 0 })
    } catch {
      return `${Math.round(value).toLocaleString()} ${currency}`
    }
  }

  // ---- Figures ----
  const newLeads = leads.filter((l) => l.status === 'pending')
  const failedLeads = leads.filter((l) => l.status === 'failed')
  const drafts = quotes.filter((q) => q.status === 'draft')
  const draftsToReview = drafts.filter((q) => (q.itemized_breakdown || []).some((i) => i.needs_review || Number(i.total_price) === 0))
  const sent = quotes.filter((q) => q.status === 'dispatched')
  const awaiting = sent.filter((q) => !q.outcome)
  const won = sent.filter((q) => q.outcome === 'accepted')
  const lost = sent.filter((q) => q.outcome === 'declined')
  const sum = (rows: typeof quotes) => rows.reduce((acc, q) => acc + Number(q.total_cost || 0), 0)
  const decided = won.length + lost.length
  const winRate = decided ? Math.round((won.length / decided) * 100) : null
  const followUps = quoteAnalytics?.needs_follow_up.length || 0
  const unreadEmails = emails.filter((e) => e.status === 'unread').length
  const escalatedChats = whatsappChats.filter((c) => c.status === 'human_required').length

  const responseTime = (() => {
    const hours = quoteAnalytics?.median_response_hours
    if (hours == null) return null
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`
    if (hours < 48) return `${hours} h`
    return `${Math.round(hours / 24)} days`
  })()

  const stats = [
    {
      label: 'To quote',
      value: newLeads.length.toLocaleString(),
      hint: newLeads.length === 1 ? 'request waiting for a price' : 'requests waiting for a price',
      path: '/workspace',
    },
    {
      label: 'Awaiting customer',
      value: awaiting.length.toLocaleString(),
      hint: awaiting.length ? `${money(sum(awaiting))} in open quotes` : 'no open quotes',
      path: '/reports',
    },
    {
      label: 'Win rate',
      value: winRate != null ? `${winRate}%` : '—',
      hint: decided ? `${won.length} won, ${lost.length} lost` : 'no quotes marked won or lost yet',
      path: '/reports',
    },
    {
      label: 'Won value',
      value: money(sum(won)),
      hint: responseTime ? `typical time to quote: ${responseTime}` : 'from accepted quotes',
      path: '/reports',
    },
  ]

  const attention = [
    { show: newLeads.length > 0, icon: Inbox, tone: 'text-amber-300', text: `${newLeads.length} new request${newLeads.length === 1 ? '' : 's'} to price`, action: 'Open pipeline', path: '/workspace' },
    { show: draftsToReview.length > 0, icon: AlertTriangle, tone: 'text-amber-300', text: `${draftsToReview.length} draft${draftsToReview.length === 1 ? ' has' : 's have'} items without a price`, action: 'Review', path: '/workspace' },
    { show: failedLeads.length > 0, icon: AlertTriangle, tone: 'text-red-300', text: `${failedLeads.length} request${failedLeads.length === 1 ? '' : 's'} could not be priced`, action: 'Retry', path: '/workspace' },
    { show: followUps > 0, icon: Clock, tone: 'text-amber-300', text: `${followUps} sent quote${followUps === 1 ? ' has' : 's have'} had no answer for ${quoteAnalytics?.follow_up_after_days ?? 3}+ days`, action: 'Follow up', path: '/reports' },
    { show: escalatedChats > 0, icon: MessageSquare, tone: 'text-amber-300', text: `${escalatedChats} WhatsApp chat${escalatedChats === 1 ? ' is' : 's are'} waiting for a person`, action: 'Open chats', path: '/whatsapp' },
    { show: unreadEmails > 0, icon: Mail, tone: 'text-slate-300', text: `${unreadEmails} unread customer email${unreadEmails === 1 ? '' : 's'}`, action: 'Open inbox', path: '/emails' },
    { show: kbFiles.length === 0, icon: Database, tone: 'text-slate-300', text: 'No price sheets uploaded, so quotes cannot be priced', action: 'Add price sheet', path: '/kb' },
    { show: emailConfigured === false, icon: Mail, tone: 'text-slate-300', text: 'No mailbox connected, so quotes cannot be emailed', action: 'Connect Gmail', path: '/profile' },
  ].filter((a) => a.show)

  const stages = [
    { label: 'New', count: newLeads.length },
    { label: 'Drafted', count: drafts.length },
    { label: 'Awaiting customer', count: awaiting.length },
    { label: 'Won', count: won.length },
    { label: 'Lost', count: lost.length },
  ]
  const stageMax = Math.max(...stages.map((s) => s.count), 1)

  const activity = useMemo(() => {
    const today = startOfDay(new Date())
    const days = Array.from({ length: ACTIVITY_DAYS }, (_, i) => ({ start: today - (ACTIVITY_DAYS - 1 - i) * DAY_MS, count: 0 }))
    for (const lead of leads) {
      const index = Math.floor((startOfDay(new Date(lead.created_at)) - days[0].start) / DAY_MS)
      if (index >= 0 && index < ACTIVITY_DAYS) days[index].count += 1
    }
    return days
  }, [leads])
  const activityMax = Math.max(...activity.map((d) => d.count), 1)
  const activityTotal = activity.reduce((acc, d) => acc + d.count, 0)
  const dayLabel = (start: number) => new Date(start).toLocaleDateString([], { month: 'short', day: 'numeric' })

  const openLead = async (lead: Lead) => {
    await setActiveLead(lead)
    navigate('/workspace')
  }

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLeadTitle.trim() || !newLeadText.trim()) return
    setIsSubmitting(true)
    setFormError('')
    try {
      await createLead(newLeadTitle.trim(), newLeadText.trim())
      setNewLeadTitle('')
      setNewLeadText('')
      setShowNewLead(false)
      setJustAdded(true)
      setTimeout(() => setJustAdded(false), 6000)
    } catch (err: any) {
      setFormError(err?.message || 'The lead could not be added. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const firstName = (userProfile?.name || '').trim().split(/\s+/)[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <PageHeader
        title={firstName ? `${greeting}, ${firstName}` : 'Dashboard'}
        description={new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={
          <button onClick={() => setShowNewLead(true)} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            New lead
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-6 space-y-6">
          {justAdded && (
            <div className="alert alert-success" role="status">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                Lead added.{' '}
                <button type="button" onClick={() => navigate('/workspace')} className="underline underline-offset-2 cursor-pointer">
                  Price it in the pipeline
                </button>
              </p>
            </div>
          )}

          {/* Headline figures */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <button
                key={stat.label}
                onClick={() => navigate(stat.path)}
                className="card p-4 text-left cursor-pointer transition-colors hover:border-slate-700 hover:bg-slate-850"
              >
                <p className="text-xs font-medium text-slate-400">{stat.label}</p>
                {loadingLeads && leads.length === 0 ? (
                  <div className="mt-2 h-8 w-20 rounded bg-slate-800 animate-pulse" />
                ) : (
                  <p className="mt-2 text-[28px] leading-8 font-semibold text-slate-50 tabular-nums">{stat.value}</p>
                )}
                <p className="mt-1.5 text-xs text-slate-500 truncate">{stat.hint}</p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Needs attention */}
            <section className="card lg:col-span-2" aria-labelledby="attention-title">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 id="attention-title" className="section-title">Needs attention</h2>
              </div>
              {attention.length === 0 ? (
                <div className="flex items-center gap-2.5 px-5 py-6 text-sm text-slate-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  Nothing is waiting on you.
                </div>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {attention.map((item) => {
                    const Icon = item.icon
                    return (
                      <li key={item.text}>
                        <button
                          onClick={() => navigate(item.path)}
                          className="group w-full flex items-center gap-3 px-5 py-3 text-left cursor-pointer transition-colors hover:bg-slate-850"
                        >
                          <Icon className={`h-4 w-4 shrink-0 ${item.tone}`} strokeWidth={1.75} />
                          <span className="flex-1 min-w-0 truncate text-sm text-slate-200">{item.text}</span>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 group-hover:text-slate-100 whitespace-nowrap">
                            {item.action}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Pipeline stages */}
            <section className="card" aria-labelledby="stages-title">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 id="stages-title" className="section-title">Pipeline</h2>
                <p className="mt-0.5 text-xs text-slate-500">Where every request stands right now.</p>
              </div>
              <dl className="p-5 space-y-3.5">
                {stages.map((stage) => (
                  <div key={stage.label}>
                    <div className="flex items-baseline justify-between text-sm">
                      <dt className="text-slate-300">{stage.label}</dt>
                      <dd className="font-medium text-slate-100 tabular-nums">{stage.count}</dd>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-800" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                        style={{ width: stage.count ? `${Math.max((stage.count / stageMax) * 100, 3)}%` : 0 }}
                      />
                    </div>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Team reminders: quotes waiting on the customer, quotes about to expire */}
            {teamReminders?.enabled && (teamReminders.waiting.length > 0 || teamReminders.expiring.length > 0) && (
              <section className="card lg:col-span-3" aria-labelledby="reminders-title">
                <div className="px-5 py-4 border-b border-slate-800">
                  <h2 id="reminders-title" className="section-title">Follow up with these customers</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Sent quotes with no answer for {teamReminders.after_days}+ days, and quotes that expire soon.</p>
                </div>
                <ul className="divide-y divide-slate-800">
                  {[...teamReminders.expiring.map((r) => ({ ...r, why: r.days_left === 0 ? 'Expires today' : `Expires in ${r.days_left} day${r.days_left === 1 ? '' : 's'}`, tone: 'text-amber-300' })),
                    ...teamReminders.waiting.filter((w) => !teamReminders.expiring.some((e) => e.quote_id === w.quote_id))
                      .map((r) => ({ ...r, why: `No answer for ${r.days_waiting} days`, tone: 'text-slate-400' }))].map((r) => (
                    <li key={r.quote_id}>
                      <button onClick={() => openReminder(r.lead_id)} className="group w-full flex items-center gap-3 px-5 py-3 text-left cursor-pointer transition-colors hover:bg-slate-850">
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-sm text-slate-200">{r.customer} · {r.quote_number || 'Quote'}</span>
                          <span className={`block text-xs ${r.tone}`}>
                            {r.why}{r.automatic_messages ? ` · ${r.automatic_messages} automatic reminder${r.automatic_messages === 1 ? '' : 's'} sent` : ''}
                          </span>
                        </span>
                        <span className="text-sm tabular-nums text-slate-300 whitespace-nowrap">
                          {r.total.toLocaleString(undefined, { maximumFractionDigits: 0 })} {r.currency}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-200" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Recent leads */}
            <section className="card lg:col-span-2" aria-labelledby="recent-title">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <h2 id="recent-title" className="section-title">Recent requests</h2>
                {leads.length > 0 && (
                  <button onClick={() => navigate('/workspace')} className="btn btn-ghost btn-sm">
                    View all
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {loadingLeads && leads.length === 0 ? (
                <div className="divide-y divide-slate-800">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="px-5 py-3.5 animate-pulse space-y-2">
                      <div className="h-3 bg-slate-800 rounded w-1/2" />
                      <div className="h-3 bg-slate-850 rounded w-1/4" />
                    </div>
                  ))}
                </div>
              ) : leads.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="No requests yet"
                  description="Add one by hand, or connect email and WhatsApp to bring requests in automatically."
                  action={
                    <button onClick={() => setShowNewLead(true)} className="btn btn-secondary btn-sm">
                      <Plus className="h-3.5 w-3.5" /> New lead
                    </button>
                  }
                />
              ) : (
                <ul className="divide-y divide-slate-800">
                  {leads.slice(0, 8).map((lead) => {
                    const Icon = sourceIcon[lead.source] || PenLine
                    const badge = leadStatus(lead.status)
                    const confirming = confirmDeleteId === lead.id
                    return (
                      <li key={lead.id} className="group flex items-center gap-1 pr-3 transition-colors hover:bg-slate-850">
                        <button onClick={() => openLead(lead)} className="flex min-w-0 flex-1 items-center gap-3 pl-5 py-3 text-left cursor-pointer">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-800 text-slate-400" title={`Source: ${lead.source}`}>
                            <Icon className="h-4 w-4" strokeWidth={1.75} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-100">{lead.title}</span>
                            <span className="block truncate text-xs text-slate-500">
                              <span className="capitalize">{lead.source}</span>
                              {' · '}
                              {timeAgo(lead.created_at)}
                            </span>
                          </span>
                          <span className={badge.className}>{badge.label}</span>
                        </button>
                        {confirming ? (
                          <span className="flex items-center gap-1 pl-2">
                            <button
                              onClick={() => {
                                deleteLead(lead.id)
                                setConfirmDeleteId(null)
                              }}
                              className="btn btn-danger btn-sm"
                            >
                              Delete
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)} className="btn btn-ghost btn-sm">Cancel</button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(lead.id)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition cursor-pointer"
                            aria-label={`Delete ${lead.title}`}
                            title="Delete lead"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Requests per day */}
            <section className="card" aria-labelledby="activity-title">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 id="activity-title" className="section-title">Requests received</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {hoveredDay != null
                    ? `${dayLabel(activity[hoveredDay].start)}: ${activity[hoveredDay].count} request${activity[hoveredDay].count === 1 ? '' : 's'}`
                    : `${activityTotal} in the last ${ACTIVITY_DAYS} days`}
                </p>
              </div>
              <div className="p-5">
                <div
                  className="flex h-28 items-end gap-0.5 border-b border-slate-700"
                  role="img"
                  aria-label={`Requests per day for the last ${ACTIVITY_DAYS} days: ${activity.map((d) => `${dayLabel(d.start)} ${d.count}`).join(', ')}`}
                  onMouseLeave={() => setHoveredDay(null)}
                >
                  {activity.map((day, i) => (
                    <div
                      key={day.start}
                      className="flex h-full flex-1 items-end px-px cursor-default"
                      onMouseEnter={() => setHoveredDay(i)}
                    >
                      <div
                        className={`w-full rounded-t ${hoveredDay === i ? 'bg-brand-400' : 'bg-brand-500'} ${day.count ? '' : 'opacity-0'}`}
                        style={{ height: day.count ? `${Math.max((day.count / activityMax) * 100, 4)}%` : '0%' }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-slate-500 tabular-nums">
                  <span>{dayLabel(activity[0].start)}</span>
                  <span>{activityTotal ? `Busiest day: ${activityMax}` : 'No requests'}</span>
                  <span>Today</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* New lead dialog */}
      {showNewLead && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowNewLead(false)
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="new-lead-title" className="w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900 shadow-popover">
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-800">
              <div>
                <h2 id="new-lead-title" className="text-base font-semibold text-slate-50">New lead</h2>
                <p className="mt-0.5 text-xs text-slate-500">Paste a customer request to price it in the pipeline.</p>
              </div>
              <button onClick={() => setShowNewLead(false)} className="btn-icon h-8 w-8 border-transparent -mr-1" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddLead} className="p-5 space-y-4">
              <div>
                <label htmlFor="lead-title" className="label">Title</label>
                <input
                  id="lead-title"
                  type="text"
                  required
                  autoFocus
                  value={newLeadTitle}
                  onChange={(e) => setNewLeadTitle(e.target.value)}
                  placeholder="e.g. Apex Corp – bracket order"
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="lead-text" className="label">Customer request</label>
                <textarea
                  id="lead-text"
                  required
                  rows={8}
                  value={newLeadText}
                  onChange={(e) => setNewLeadText(e.target.value)}
                  placeholder="Paste the email or message exactly as you received it."
                  className="input resize-none leading-6"
                />
              </div>
              {formError && (
                <div className="alert alert-error" role="alert">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>{formError}</p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowNewLead(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="btn btn-primary">
                  {isSubmitting ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Add lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
export default Dashboard
