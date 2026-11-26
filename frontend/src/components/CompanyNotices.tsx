import React from 'react'
import { AlertTriangle, CreditCard, Info, X } from 'lucide-react'
import { useWorkspaceStore, CompanyNotice } from '../store/workspaceStore'

export const formatNoticeAmount = (n: Pick<CompanyNotice, 'amount' | 'currency'>) => {
  if (n.amount == null) return null
  try {
    return Number(n.amount).toLocaleString(undefined, { style: 'currency', currency: n.currency || 'USD' })
  } catch {
    return `${n.amount} ${n.currency || ''}`.trim()
  }
}

export const noticeIcon = (kind: CompanyNotice['kind']) =>
  kind === 'payment' ? CreditCard : kind === 'warning' ? AlertTriangle : Info

const dueText = (n: CompanyNotice) => {
  const amount = formatNoticeAmount(n)
  const due = n.due_date ? new Date(n.due_date + 'T00:00:00').toLocaleDateString([], { dateStyle: 'medium' }) : null
  return [amount, due ? `due ${due}` : null].filter(Boolean).join(' · ')
}

/** One message from AXRFLOWS: title, text, amount and pay link. */
export const NoticeCard: React.FC<{ notice: CompanyNotice; compact?: boolean }> = ({ notice, compact }) => {
  const Icon = noticeIcon(notice.kind)
  const meta = dueText(notice)
  return (
    <div className="flex gap-3">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${notice.kind === 'payment' ? 'bg-amber-500/15 text-amber-300' : notice.kind === 'warning' ? 'bg-red-500/15 text-red-300' : 'bg-slate-800 text-slate-300'}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-slate-100">{notice.title}</span>
          {notice.resolved && <span className="shrink-0 text-[11px] text-emerald-400">Resolved</span>}
        </span>
        {meta && <span className="mt-0.5 block text-xs text-amber-200">{meta}</span>}
        {notice.body && <span className={`mt-0.5 block text-xs text-slate-400 whitespace-pre-line ${compact ? 'line-clamp-3' : ''}`}>{notice.body}</span>}
        {notice.payment_link && !notice.resolved && (
          <a href={notice.payment_link} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-xs font-semibold text-brand-300 hover:text-brand-200">
            Pay now →
          </a>
        )}
      </span>
    </div>
  )
}

/** Pinned messages from AXRFLOWS across the top of the app, until the admin resolves them. */
export const NoticeBanner: React.FC = () => {
  const { companyNotices, markCompanyNoticesRead } = useWorkspaceStore()
  const pinned = companyNotices.filter((n) => n.show_banner && !n.resolved && (n.kind === 'payment' || !n.read))
  if (pinned.length === 0) return null
  return (
    <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10">
      {pinned.slice(0, 3).map((n) => (
        <div key={n.id} className="px-6 py-2.5 flex items-start gap-4">
          <div className="flex-1 min-w-0"><NoticeCard notice={n} compact /></div>
          {n.kind !== 'payment' && (
            <button onClick={() => markCompanyNoticesRead([n.id])} className="text-slate-400 hover:text-slate-100 cursor-pointer" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
