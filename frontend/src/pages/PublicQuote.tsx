import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Check, Printer, X } from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

interface PublicQuoteData {
  quote_number: string | null
  status: 'sent' | 'draft'
  issued_at: string
  valid_until: string | null
  expired: boolean
  currency: string
  customer_name: string | null
  customer_company: string | null
  items: { description: string; quantity: number; unit_price: number; total_price: number }[]
  subtotal: number
  discount_percent: number
  discount_amount: number
  tax_percent: number
  tax_amount: number
  total: number
  payment_terms: string | null
  outcome: 'accepted' | 'declined' | null
  responded_at: string | null
  seller: { company_name: string | null; name: string | null; email: string | null; phone: string | null }
}

// The page a customer opens from the quote email. It is deliberately a plain,
// light document: it has to read well on a phone and print cleanly as a PDF.
export const PublicQuote: React.FC = () => {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const isPreview = searchParams.get('preview') === '1'

  const [quote, setQuote] = useState<PublicQuoteData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`${BACKEND_URL}/api/public/quotes/${encodeURIComponent(token || '')}${isPreview ? '?preview=true' : ''}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'This quote link is not valid.' : 'The quote could not be loaded. Please try again.')
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        setQuote(data)
        document.title = `Quotation ${data.quote_number || ''}${data.seller?.company_name ? ` - ${data.seller.company_name}` : ''}`
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [token, isPreview])

  const respond = async (decision: 'accepted' | 'declined') => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch(`${BACKEND_URL}/api/public/quotes/${encodeURIComponent(token || '')}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comment })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Your response could not be recorded. Please try again.')
      setQuote((prev) => (prev ? { ...prev, outcome: decision, responded_at: new Date().toISOString() } : prev))
    } catch (err: any) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <p className="text-slate-700">{loadError}</p>
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const money = (value: number) => {
    try {
      return value.toLocaleString(undefined, { style: 'currency', currency: quote.currency })
    } catch {
      return `${value.toFixed(2)} ${quote.currency}`
    }
  }
  const day = (value: string | null) =>
    value ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString([], { dateStyle: 'long' }) : ''
  const sellerName = quote.seller.company_name || quote.seller.name || 'Quotation'
  const canRespond = quote.status === 'sent' && !quote.outcome && !isPreview

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 py-6 px-4 sm:py-10 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        {isPreview && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 print:hidden">
            Preview. This is what your customer sees{quote.status === 'draft' ? ' once the quote is sent' : ''}. Opening it here is not counted as a view.
          </div>
        )}

        <article className="bg-white rounded-lg shadow-sm border border-slate-200 print:shadow-none print:border-0">
          <header className="flex flex-wrap items-start justify-between gap-4 p-6 sm:p-8 border-b border-slate-200">
            <div className="min-w-0">
              <p className="text-xl font-semibold break-words">{sellerName}</p>
              <p className="mt-1 text-sm text-slate-600">
                {[quote.seller.company_name ? quote.seller.name : null, quote.seller.email, quote.seller.phone].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="text-sm sm:text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Quotation</p>
              <p className="font-semibold tabular-nums">{quote.quote_number || ''}</p>
              <p className="mt-1 text-slate-600">Issued {day(quote.issued_at)}</p>
              {quote.valid_until && (
                <p className={quote.expired ? 'text-red-700' : 'text-slate-600'}>
                  {quote.expired ? 'Expired' : 'Valid until'} {day(quote.valid_until)}
                </p>
              )}
            </div>
          </header>

          {(quote.customer_name || quote.customer_company) && (
            <section className="px-6 sm:px-8 pt-6 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Prepared for</p>
              <p className="mt-1 font-medium">{quote.customer_name}</p>
              {quote.customer_company && <p className="text-slate-600">{quote.customer_company}</p>}
            </section>
          )}

          <section className="p-6 sm:p-8">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 text-left font-medium">Description</th>
                    <th className="py-2 px-3 text-right font-medium">Qty</th>
                    <th className="py-2 px-3 text-right font-medium">Unit price</th>
                    <th className="py-2 pl-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {quote.items.map((item, i) => (
                    <tr key={i}>
                      <td className="py-2.5 pr-3 break-words">{item.description}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{item.quantity}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">{money(item.unit_price)}</td>
                      <td className="py-2.5 pl-3 text-right tabular-nums whitespace-nowrap">{money(item.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="mt-6 ml-auto w-full max-w-xs space-y-1.5 text-sm">
              {(quote.discount_amount > 0 || quote.tax_amount > 0) && (
                <div className="flex justify-between text-slate-600">
                  <dt>Subtotal</dt>
                  <dd className="tabular-nums">{money(quote.subtotal)}</dd>
                </div>
              )}
              {quote.discount_amount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <dt>Discount ({quote.discount_percent}%)</dt>
                  <dd className="tabular-nums">−{money(quote.discount_amount)}</dd>
                </div>
              )}
              {quote.tax_amount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <dt>Tax ({quote.tax_percent}%)</dt>
                  <dd className="tabular-nums">{money(quote.tax_amount)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-300 pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{money(quote.total)}</dd>
              </div>
            </dl>

            {quote.payment_terms && (
              <p className="mt-6 text-sm text-slate-600">
                <span className="font-medium text-slate-800">Terms: </span>
                {quote.payment_terms}
              </p>
            )}
          </section>

          <footer className="border-t border-slate-200 p-6 sm:p-8 print:hidden">
            {quote.outcome === 'accepted' && (
              <p className="flex items-center gap-2 text-emerald-700 font-medium">
                <Check className="h-5 w-5" /> You accepted this quote{quote.responded_at ? ` on ${day(quote.responded_at)}` : ''}. {sellerName} will be in touch.
              </p>
            )}
            {quote.outcome === 'declined' && (
              <p className="text-slate-700">This quote was declined{quote.responded_at ? ` on ${day(quote.responded_at)}` : ''}.</p>
            )}

            {canRespond && (
              <div className="space-y-3">
                <label htmlFor="quote-comment" className="block text-sm font-medium text-slate-800">
                  Message to {sellerName} (optional)
                </label>
                <textarea
                  id="quote-comment"
                  value={comment}
                  maxLength={1000}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  placeholder="PO number, delivery notes, or what you would like changed"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                {quote.expired && (
                  <p className="text-sm text-red-700">This quote has expired. Please ask {sellerName} for an updated quote.</p>
                )}
                {submitError && <p className="text-sm text-red-700" role="alert">{submitError}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => respond('accepted')}
                    disabled={submitting || quote.expired}
                    className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Check className="h-4 w-4" /> Accept quote
                  </button>
                  <button
                    onClick={() => respond('declined')}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                  >
                    <X className="h-4 w-4" /> Decline
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => window.print()}
              className="mt-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <Printer className="h-4 w-4" /> Print or save as PDF
            </button>
          </footer>
        </article>
      </div>
    </div>
  )
}

export default PublicQuote
