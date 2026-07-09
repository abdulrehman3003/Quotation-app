import React, { useEffect, useMemo } from 'react'
import { useWorkspaceStore } from '../store/workspaceStore'
import { Download, FileSpreadsheet, Loader2, RefreshCw, Phone, Calendar } from 'lucide-react'

export default function QuotationReports() {
  const { dispatchedQuotes, loadingDispatched, fetchDispatchedQuotes } = useWorkspaceStore()

  useEffect(() => {
    fetchDispatchedQuotes()
  }, [fetchDispatchedQuotes])

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
      'Customer Name', 
      'Customer Email', 
      'Phone Number', 
      ...itemHeaders,
      'Material Cost ($)', 
      'Labor Cost ($)', 
      'Total Amount ($)', 
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

      return [
        `"${quote.customer_name.replace(/"/g, '""')}"`,
        `"${quote.customer_email.replace(/"/g, '""')}"`,
        `"${(quote.customer_phone || '').replace(/"/g, '""')}"`,
        ...itemCells,
        Number(quote.material_cost || 0).toFixed(2),
        Number(quote.labor_cost || 0).toFixed(2),
        Number(quote.total_amount || 0).toFixed(2),
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

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto">
        {/* Top Header */}
        <div className="border-b border-slate-800 pb-6 mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="h-8 w-8 text-emerald-400" />
              Quotation Analytics & Reports
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              View details of dispatched quotations and export database records in Excel format.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchDispatchedQuotes()}
              className="p-2.5 border border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
            >
              <RefreshCw className={`h-4.5 w-4.5 ${loadingDispatched ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleExportExcel}
              disabled={dispatchedQuotes.length === 0}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-lg hover:shadow-emerald-500/20"
            >
              <Download className="h-4.5 w-4.5" />
              Download Excel Report
            </button>
          </div>
        </div>

        {/* Leads Table Card */}
        <div className="rounded-xl bg-slate-900/40 border border-slate-800/80 overflow-hidden shadow-2xl backdrop-blur-sm">
          {loadingDispatched ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              <p className="text-sm text-slate-500">Retrieving report records...</p>
            </div>
          ) : dispatchedQuotes.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 text-center px-4">
              <FileSpreadsheet className="h-10 w-10 mb-3 text-slate-600" />
              <h3 className="text-base font-bold text-slate-400">No Dispatched Quotes Found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Once quotes are generated and approved in the pipeline or chat channels, they will be registered here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm text-slate-300">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Customer Name</th>
                    <th className="px-6 py-4">Customer Email</th>
                    <th className="px-6 py-4">Phone</th>
                    {Array.from({ length: maxItemsCount }).map((_, i) => (
                      <th key={i} className="px-6 py-4">{`Item ${i + 1}`}</th>
                    ))}
                    <th className="px-6 py-4 text-right">Material Cost</th>
                    <th className="px-6 py-4 text-right">Labor Cost</th>
                    <th className="px-6 py-4 text-right font-bold text-slate-200">Total Cost</th>
                    <th className="px-6 py-4">Dispatched At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/10">
                  {dispatchedQuotes.map((quote) => (
                    <tr key={quote.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-6 py-4 font-semibold text-white">
                        {quote.customer_name}
                      </td>
                      <td className="px-6 py-4 text-slate-300 text-xs font-mono">
                        {quote.customer_email}
                      </td>
                      <td className="px-6 py-4">
                        {quote.customer_phone ? (
                          <span className="text-slate-300 flex items-center gap-1.5 text-xs font-mono">
                            <Phone className="h-3 w-3 text-slate-500 shrink-0" />
                            {quote.customer_phone}
                          </span>
                        ) : (
                          <span className="text-slate-600 italic text-xs">Not mentioned</span>
                        )}
                      </td>
                      {Array.from({ length: maxItemsCount }).map((_, i) => {
                        const item = (quote.itemized_breakdown || [])[i]
                        return (
                          <td key={i} className="px-6 py-4 text-xs text-slate-300 max-w-[160px] truncate" title={item ? `${item.description} (Qty: ${item.quantity})` : ''}>
                            {item ? (
                              <span className="flex items-center justify-between gap-1">
                                <span className="truncate">{item.description}</span>
                                <span className="text-slate-500 font-mono text-[10px] bg-slate-800/80 px-1 py-0.5 rounded shrink-0">
                                  x{item.quantity}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-700 italic">-</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-6 py-4 text-right font-semibold text-slate-300">
                        ${Number(quote.material_cost || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-slate-300">
                        ${Number(quote.labor_cost || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-400">
                        ${Number(quote.total_amount || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-600 shrink-0" />
                          {new Date(quote.created_at).toLocaleString()}
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
  )
}
