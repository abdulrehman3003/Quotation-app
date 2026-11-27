import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, Loader2, X } from 'lucide-react'

// Demo requests are emailed through FormSubmit (https://formsubmit.co). The very first
// submission sends an activation email to this address; click the link in it once.
// After activating you can swap the address for the random alias FormSubmit gives you
// to keep the email out of the page source.
const FORM_ENDPOINT = 'https://formsubmit.co/ajax/axrflows@gmail.com'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export const DemoRequestModal: React.FC<{ open: boolean; plan?: string; onClose: () => void }> = ({ open, plan, onClose }) => {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const firstField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setStatus('idle')
    setError('')
    const t = setTimeout(() => firstField.current?.focus(), 50)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>
    if (data._honey) return // bot filled the hidden field
    setStatus('sending')
    setError('')
    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...data,
          _subject: `Demo request: ${data.company || data.name}${plan ? ` (${plan})` : ''}`,
          _template: 'table',
          _replyto: data.email,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || String(body.success) === 'false') throw new Error(body.message || 'The request could not be sent.')
      setStatus('sent')
    } catch (err: any) {
      setStatus('error')
      setError(err?.message || 'The request could not be sent.')
    }
  }

  const input = 'w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none'
  const label = 'block text-xs font-medium text-slate-400 mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-title"
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="demo-title" className="text-lg font-semibold text-white">Book a free demo</h2>
            <p className="mt-1 text-sm text-slate-400">
              20 minutes. Send one of your real enquiries and we'll show you the priced quote it turns into. We reply within one business day.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-white cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {status === 'sent' ? (
          <div className="mt-8 mb-4 text-center">
            <CheckCircle className="mx-auto h-10 w-10 text-emerald-400" />
            <p className="mt-3 font-medium text-white">Thanks, your request is in.</p>
            <p className="mt-1 text-sm text-slate-400">We'll email you to agree a time for the demo.</p>
            <button onClick={onClose} className="mt-6 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 cursor-pointer">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="demo-name" className={label}>Your name</label>
                <input ref={firstField} id="demo-name" name="name" required maxLength={100} autoComplete="name" className={input} />
              </div>
              <div>
                <label htmlFor="demo-company" className={label}>Company</label>
                <input id="demo-company" name="company" required maxLength={120} autoComplete="organization" className={input} />
              </div>
              <div>
                <label htmlFor="demo-email" className={label}>Work email</label>
                <input id="demo-email" name="email" type="email" required maxLength={150} autoComplete="email" className={input} />
              </div>
              <div>
                <label htmlFor="demo-phone" className={label}>WhatsApp / phone <span className="text-slate-600">(optional)</span></label>
                <input id="demo-phone" name="phone" type="tel" maxLength={30} autoComplete="tel" placeholder="+971 50 123 4567" className={input} />
              </div>
              <div>
                <label htmlFor="demo-country" className={label}>Country</label>
                <input id="demo-country" name="country" required maxLength={60} autoComplete="country-name" placeholder="United Arab Emirates" className={input} />
              </div>
              <div>
                <label htmlFor="demo-volume" className={label}>Quotes per month</label>
                <select id="demo-volume" name="quotes_per_month" defaultValue="" required className={input}>
                  <option value="" disabled>Choose</option>
                  <option>Under 20</option>
                  <option>20 – 100</option>
                  <option>100 – 300</option>
                  <option>More than 300</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="demo-message" className={label}>What do you sell, and how do enquiries reach you? <span className="text-slate-600">(optional)</span></label>
              <textarea id="demo-message" name="message" rows={3} maxLength={2000} placeholder="e.g. Aluminium windows and glass partitions; most enquiries come on WhatsApp with photos." className={input} />
            </div>
            {plan && <input type="hidden" name="plan" value={plan} />}
            {/* Spam trap: people never see or fill this */}
            <input type="text" name="_honey" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

            {status === 'error' && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error} You can also email us at <a href="mailto:axrflows@gmail.com" className="underline">axrflows@gmail.com</a>.
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 cursor-pointer"
            >
              {status === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
              Request my demo
            </button>
            <p className="text-center text-xs text-slate-500">
              We use these details only to arrange your demo. See our <Link to="/privacy" target="_blank" className="underline underline-offset-2 hover:text-slate-300">Privacy Policy</Link>.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

export default DemoRequestModal
