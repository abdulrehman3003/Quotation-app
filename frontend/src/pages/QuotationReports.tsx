import React, { useEffect, useMemo } from 'react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { useWorkspaceStore } from '../store/workspaceStore'
import { Download, Eye, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react'

export default function QuotationReports() {
  const { dispatchedQuotes, loadingDispatched, fetchDispatchedQuotes, quoteAnalytics, fetchQuoteAnalytics, setQuoteOutcome } = useWorkspaceStore()

  const refresh = () => {
    fetchDispatchedQuotes()
    fetchQuoteAnalytics()
  }

  useEffect(() => {
    fetchDispatchedQuotes()
    fetchQuoteAnalytics()
  }, [fetchDispatchedQuotes, fetchQuoteAnalytics])

  const changeOutcome = async (quoteId: string, value: string) => {
    try {
      await setQuoteOutcome(quoteId, value === 'accepted' || value === 'declined' ? value : null)
      fetchQuoteAnalytics()
    } catch (err) {
      console.error(err)
    }
  }

  const outcomeLabel = (quote: any) =>
    quote.outcome === 'accepted' ? 'Won' : quote.outcome === 'declined' ? 'Lost' : 'Open'

  // Determine the maximum number of items across all dispatched quotes to generate dynamic vertical columns
  const maxItemsCount = useMemo(() => {
    if (dispatchedQuotes.length === 0) return 0
    return Math.max(...dispatchedQuotes.map(q => (q.itemized_breakdown || []).length), 1)
  }, [dispatchedQuotes])

  const handleExportExcel = () => {
    if (dispatchedQuotes.length === 0) return

    // Generate dynamic item column headers
    const itemHeaders = Array.from({ length: maxItemsCount }, (_, i) => `Item ${i + 1}`)
    const headers = [
      'Quote Number',
      'Customer Name', 
      'Customer Email', 
      'Phone Number', 
      ...itemHeaders,
      'Material Cost ($)', 
      'Labor Cost ($)', 
      'Total Amount ($)', 
      'Outcome',
      'Times Opened',
      'Attended By (Employee)',
      'Date Dispatched'
    ]

    const rows = dispatchedQuotes.map(quote => {
      const items = quote.itemized_breakdown || []
      const itemCells = Array.from({ length: maxItemsCount }, (_, i) => {
        const item = items[i]
        if (item) {
          const desc = (item.description || '').replace(/"/g, '""')
          const qty = item.quantity || 1
          return `"${desc} (Qty: ${qty})"`
        }
        return '""'
      })

      const attendedBy = quote.employee_name || quote.employee_email || 'Team Member'

      return [
        `"${(quote.quote_number || '').replace(/"/g, '""')}"`,
        `"${(quote.customer_name || '').replace(/"/g, '""')}"`,
        `"${(quote.customer_email || '').replace(/"/g, '""')}"`,
        `"${(quote.customer_phone || '').replace(/"/g, '""')}"`,
        ...itemCells,
        Number(quote.material_cost || 0).toFixed(2),
        Number(quote.labor_cost || 0).toFixed(2),
        Number(quote.total_amount || 0).toFixed(2),
        outcomeLabel(quote),
        Number(quote.view_count || 0),
        `"${attendedBy.replace(/"/g, '""')}"`,
        new Date(quote.created_at).toLocaleString()
      ]
    })

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `dispatched_quotations_${new Date().toISOString().slice(0,10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const totalValue = dispatchedQuotes.reduce((sum, q) => sum + Number(q.total_amount || 0), 0)
  const money = (value: number) => value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <PageHeader
        title="Reports"
        description="Every quote that has been sent, who handled it, and whether it was won."
        actions={
          <>
            <button onClick={refresh} className="btn-icon" aria-label="Refresh" title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loadingDispatched ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={handleExportExcel} disabled={dispatchedQuotes.length === 0} className="btn btn-secondary">
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-6 space-y-6">
        {dispatchedQuotes.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-4">
              <p className="text-xs font-medium text-slate-400">Quotes sent</p>
              <p className="mt-2 text-2xl font-semibold text-slate-50 tabular-nums">{dispatchedQuotes.length}</p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">{money(totalValue)} quoted</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-medium text-slate-400">Win rate</p>
              <p className="mt-2 text-2xl font-semibold text-slate-50 tabular-nums">
                {quoteAnalytics?.win_rate != null ? `${quoteAnalytics.win_rate}%` : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                {quoteAnalytics
                  ? quoteAnalytics.win_rate != null
                    ? `${quoteAnalytics.accepted} won, ${quoteAnalytics.declined} lost`
                    : 'No quotes marked won or lost yet'
                  : ''}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-medium text-slate-400">Won value</p>
              <p className="mt-2 text-2xl font-semibold text-slate-50 tabular-nums">{money(quoteAnalytics?.won_value || 0)}</p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                {quoteAnalytics ? `${money(quoteAnalytics.open_value)} still open` : ''}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-medium text-slate-400">Typical time to quote</p>
              <p className="mt-2 text-2xl font-semibold text-slate-50 tabular-nums">
                {quoteAnalytics?.median_response_hours != null
                  ? quoteAnalytics.median_response_hours < 1
                    ? `${Math.max(1, Math.round(quoteAnalytics.median_response_hours * 60))} min`
                    : quoteAnalytics.median_response_hours < 48
                    ? `${quoteAnalytics.median_response_hours} h`
                    : `${Math.round(quoteAnalytics.median_response_hours / 24)} days`
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500">Median, request received to quote sent</p>
            </div>
          </div>
        )}

        {quoteAnalytics && quoteAnalytics.needs_follow_up.length > 0 && (
          <div className="alert alert-warning" role="status">
            <span>
              {quoteAnalytics.needs_follow_up.length} quote{quoteAnalytics.needs_follow_up.length === 1 ? ' has' : 's have'} had no answer for{' '}
              {quoteAnalytics.follow_up_after_days} days or more. They are marked "Follow up" below.
            </span>
          </div>
        )}

        <div className="card overflow-hidden">
          {loadingDispatched && dispatchedQuotes.length === 0 ? (
            <div className="py-20 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading report
            </div>
          ) : dispatchedQuotes.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="No quotes sent yet"
              description="Quotes appear here once they have been sent from the pipeline or WhatsApp."
              className="py-20"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm text-slate-300">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-850 text-slate-400 text-xs font-medium whitespace-nowrap">
                    <th className="px-4 py-2.5 font-medium">Quote</th>
                    <th className="px-4 py-2.5 font-medium">Outcome</th>
                    <th className="px-4 py-2.5 font-medium">Customer</th>
                    <th className="px-4 py-2.5 font-medium">Email</th>
                    <th className="px-4 py-2.5 font-medium">Phone</th>
                    {Array.from({ length: maxItemsCount }).map((_, i) => (
                      <th key={i} className="px-4 py-2.5 font-medium">{`Item ${i + 1}`}</th>
                    ))}
                    <th className="px-4 py-2.5 font-medium text-right">Materials</th>
                    <th className="px-4 py-2.5 font-medium text-right">Labour</th>
                    <th className="px-4 py-2.5 font-medium text-right">Total</th>
                    <th className="px-4 py-2.5 font-medium">Handled by</th>
                    <th className="px-4 py-2.5 font-medium">Sent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {dispatchedQuotes.map((quote) => (
                    <tr key={quote.id} className="hover:bg-slate-850 transition-colors">
                      <td className="px-4 py-3 text-slate-400 tabular-nums whitespace-nowrap">
                        {quote.quote_number || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Outcome for ${quote.quote_number || quote.customer_name}`}
                            value={quote.outcome || ''}
                            onChange={(e) => changeOutcome(quote.id, e.target.value)}
                            className={`input input-sm w-24 text-xs ${
                              quote.outcome === 'accepted' ? 'text-emerald-300' : quote.outcome === 'declined' ? 'text-red-300' : ''
                            }`}
                          >
                            <option value="">Open</option>
                            <option value="accepted">Won</option>
                            <option value="declined">Lost</option>
                          </select>
                          {quote.needs_follow_up && <span className="badge badge-warning">Follow up</span>}
                          {quote.view_count > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500" title={`Opened by the customer ${quote.view_count} time(s)`}>
                              <Eye className="h-3.5 w-3.5" />
                              {quote.view_count}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-100 whitespace-nowrap">
                        {quote.customer_name}
                      </td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                        {quote.customer_email}
                      </td>
                      <td className="px-4 py-3">
                        {quote.customer_phone ? (
                          <span className="text-slate-300 tabular-nums whitespace-nowrap">
                            {quote.customer_phone}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      {Array.from({ length: maxItemsCount }).map((_, i) => {
                        const item = (quote.itemized_breakdown || [])[i]
                        return (
                          <td key={i} className="px-4 py-3 text-slate-300 max-w-[200px] truncate" title={item ? `${item.description} (Qty: ${item.quantity})` : ''}>
                            {item ? (
                              <span className="flex items-center justify-between gap-1">
                                <span className="truncate">{item.description}</span>
                                <span className="text-slate-500 text-xs tabular-nums shrink-0">
                                  ×{item.quantity}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                        ${Number(quote.material_cost || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                        ${Number(quote.labor_cost || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-50 tabular-nums">
                        ${Number(quote.total_amount || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-slate-800 text-slate-300 text-[11px] font-semibold flex items-center justify-center shrink-0">
                            {(quote.employee_name || quote.employee_email || 'T').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-slate-200 truncate">
                              {quote.employee_name || 'Team member'}
                            </p>
                            {quote.employee_email && (
                              <p className="text-xs text-slate-500 truncate">
                                {quote.employee_email}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        <span>
                          {new Date(quote.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
