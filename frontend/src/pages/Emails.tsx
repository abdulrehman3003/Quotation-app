import React, { useEffect, useMemo, useState } from 'react'
import { useWorkspaceStore, CustomerEmail } from '../store/workspaceStore'
import { useNavigate } from 'react-router-dom'
import { Mail, ArrowRight, CheckCircle2, Send, Loader2, Inbox, ExternalLink, Copy, Check, RefreshCw, Search, Settings, MailPlus } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

// URL detection regex
const URL_REGEX = /(https?:\/\/[^\s]+)/g

// Strips invisible unicode control characters (soft hyphens, zero-width spaces, etc.)
function stripInvisible(text: string): string {
  return text.replace(/[\u00AD\u200B\u200C\u200D\uFEFF\u034F]/g, '')
}

// Splits text into tokens: either a URL or plain text
function parseLineTokens(line: string): { type: 'text' | 'url'; content: string }[] {
  const tokens: { type: 'text' | 'url'; content: string }[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const regex = new RegExp(URL_REGEX.source, 'g')
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: line.slice(lastIndex, match.index) })
    }
    tokens.push({ type: 'url', content: match[0].replace(/[.,;)]$/, '') })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < line.length) {
    tokens.push({ type: 'text', content: line.slice(lastIndex) })
  }
  return tokens
}

// A list number or bullet alone on its line ("1.", "2)", "-", "•")
const LIST_MARKER_LINE = /^\s*(\d{1,3}[.)]|[a-zA-Z][.)]|[-*\u2022\u00b7\u25aao])\s*$/

// Outlook often sends "1." on one line and the item on the next; join them back.
function joinListMarkers(lines: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (LIST_MARKER_LINE.test(lines[i])) {
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) j++
      if (j < lines.length && !LIST_MARKER_LINE.test(lines[j])) {
        out.push(`${lines[i].trim()} ${lines[j].trim()}`)
        i = j
        continue
      }
    }
    out.push(lines[i])
  }
  return out
}

// Main email body renderer — handles separators, blank lines, URLs, invisible chars
function renderEmailBody(rawBody: string): React.ReactNode {
  if (!rawBody) return null

  // Normalize literal \n escape sequences into real newlines, then strip invisibles
  const normalized = stripInvisible(rawBody.replace(/\\n/g, '\n').replace(/\\r/g, ''))
  const lines = joinListMarkers(normalized.split('\n'))

  const elements: React.ReactNode[] = []
  let key = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Detect separator lines: 3+ dashes or equals signs
    if (/^[-=]{3,}$/.test(trimmed)) {
      elements.push(
        <div key={key++} className="border-t border-slate-800 my-3" />
      )
      continue
    }

    // Blank line → paragraph spacing
    if (!trimmed) {
      elements.push(<div key={key++} className="h-2" />)
      continue
    }

    // Render line with inline URL links
    const tokens = parseLineTokens(trimmed)
    const hasOnlyUrl = tokens.length === 1 && tokens[0].type === 'url'

    if (hasOnlyUrl) {
      // Render standalone URL as a block link pill
      const url = tokens[0].content
      const label = url.length > 60 ? url.slice(0, 57) + '…' : url
      elements.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-brand-300 hover:text-brand-200 underline underline-offset-2 break-all transition-colors my-0.5"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          {label}
        </a>
      )
    } else {
      elements.push(
        <p key={key++} className="text-sm text-slate-300 leading-6">
          {tokens.map((token, ti) =>
            token.type === 'url' ? (
              <a
                key={ti}
                href={token.content}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-300 hover:text-brand-200 underline underline-offset-2 transition-colors break-all"
              >
                {token.content.length > 50 ? token.content.slice(0, 47) + '…' : token.content}
              </a>
            ) : (
              <span key={ti}>{token.content}</span>
            )
          )}
        </p>
      )
    }
  }

  return <div className="flex flex-col gap-0.5">{elements}</div>
}

type StatusFilter = 'all' | 'unread' | 'imported' | 'replied'

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'imported', label: 'In pipeline' },
  { id: 'replied', label: 'Replied' }
]

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  unread: { label: 'Unread', className: 'badge badge-accent' },
  imported: { label: 'In pipeline', className: 'badge badge-warning' },
  replied: { label: 'Replied', className: 'badge badge-success' }
}

// "Jane Doe <jane@acme.com>" -> { name: "Jane Doe", address: "jane@acme.com" }
function parseSender(raw: string): { name: string; address: string } {
  const match = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (match && match[1]) return { name: match[1].trim(), address: match[2].trim() }
  const address = (match ? match[2] : raw).trim()
  const local = address.split('@')[0] || address
  return { name: local, address }
}

// Plain one-line preview: drops HTML comments/tags and collapses whitespace
function previewOf(body: string): string {
  return stripInvisible(body || '')
    .replace(/\\[nr]/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatListDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Emails() {
  const navigate = useNavigate()
  const {
    emails,
    emailConfigured,
    loadingEmails,
    fetchEmails,
    transferEmail,
    markEmailRead,
    replyEmail,
    userProfile,
    error
  } = useWorkspaceStore()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [replyText, setReplyText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchEmails()
  }, [fetchEmails])

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { all: emails.length, unread: 0, imported: 0, replied: 0 }
    emails.forEach((e) => {
      if (e.status in result) result[e.status as StatusFilter] += 1
    })
    return result
  }, [emails])

  const visibleEmails = useMemo(() => {
    const q = query.trim().toLowerCase()
    return emails.filter((e) => {
      if (filter !== 'all' && e.status !== filter) return false
      if (!q) return true
      return (
        e.sender_email.toLowerCase().includes(q) ||
        (e.subject || '').toLowerCase().includes(q) ||
        (e.body || '').toLowerCase().includes(q)
      )
    })
  }, [emails, filter, query])

  const selectedEmail: CustomerEmail | null = emails.find((e) => e.id === selectedId) || null

  const selectEmail = (id: string) => {
    setSelectedId(id)
    const opened = emails.find((e) => e.id === id)
    if (opened?.status === 'unread') markEmailRead(id).catch(() => {})
    setNotice(null)
    setReplyText('')
  }

  const handleTransfer = async (id: string) => {
    setProcessing(true)
    setNotice(null)
    try {
      await transferEmail(id)
      setNotice({ tone: 'success', text: 'Added to the pipeline. Open Pipeline to price this request.' })
    } catch (err) {
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const handleReply = async (id: string) => {
    if (!replyText.trim()) return
    setProcessing(true)
    setNotice(null)
    try {
      const result = await replyEmail(id, replyText)
      setReplyText('')
      const to = selectedEmail ? parseSender(selectedEmail.sender_email).address : 'the customer'
      if (result?.sent) {
        setNotice({ tone: 'success', text: `Reply sent to ${to}.` })
      } else {
        setNotice({
          tone: 'warning',
          text: 'Reply saved but not sent, because no Gmail account is connected. Connect one in Settings.'
        })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(replyText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const refreshButton = (
    <button onClick={() => fetchEmails()} className="btn btn-secondary" disabled={loadingEmails}>
      <RefreshCw className={`h-4 w-4 ${loadingEmails ? 'animate-spin' : ''}`} />
      Refresh
    </button>
  )

  // No mailbox connected: show nothing but the way to connect one.
  if (emailConfigured === false) {
    return (
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <PageHeader title="Email" description="Customer enquiries received in your connected mailbox." />
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={MailPlus}
            title="Connect a mailbox to see your email"
            description="Add your Gmail address and app password in Settings. Incoming enquiries will then appear here, and replies will be sent from that address."
            action={
              <button onClick={() => navigate('/profile')} className="btn btn-primary">
                <Settings className="h-4 w-4" />
                Open settings
              </button>
            }
          />
        </div>
      </div>
    )
  }

  const initialLoad = loadingEmails && emails.length === 0
  const sender = selectedEmail ? parseSender(selectedEmail.sender_email) : null
  const mailbox = userProfile?.gmail_email as string | undefined

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <PageHeader
        title="Email"
        description={mailbox ? `Customer enquiries received at ${mailbox}` : 'Customer enquiries received in your connected mailbox.'}
        actions={refreshButton}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Message list */}
        <section className="w-[380px] shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/40" aria-label="Messages">
          <div className="p-3 border-b border-slate-800 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sender, subject or text"
                className="input pl-9"
              />
            </div>
            <div className="flex gap-1" role="tablist" aria-label="Filter messages">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    filter === f.id ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-850'
                  }`}
                >
                  {f.label}
                  <span className="ml-1.5 text-slate-500 tabular-nums">{counts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {error && <div className="alert alert-error m-3">{error}</div>}

            {initialLoad || emailConfigured === null ? (
              <div className="divide-y divide-slate-800">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-4 py-3.5 space-y-2 animate-pulse">
                    <div className="flex justify-between">
                      <div className="h-3 bg-slate-800 rounded w-1/3" />
                      <div className="h-3 bg-slate-800 rounded w-10" />
                    </div>
                    <div className="h-3 bg-slate-800 rounded w-3/4" />
                    <div className="h-3 bg-slate-850 rounded w-5/6" />
                  </div>
                ))}
              </div>
            ) : visibleEmails.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title={emails.length === 0 ? 'No email yet' : 'No messages match'}
                description={
                  emails.length === 0
                    ? 'New enquiries sent to your connected mailbox will show up here.'
                    : 'Try a different search or filter.'
                }
              />
            ) : (
              <ul className="divide-y divide-slate-800">
                {visibleEmails.map((email) => {
                  const isSelected = selectedId === email.id
                  const isUnread = email.status === 'unread'
                  const from = parseSender(email.sender_email)
                  return (
                    <li key={email.id}>
                      <button
                        data-testid="list-item"
                        onClick={() => selectEmail(email.id)}
                        aria-current={isSelected}
                        className={`relative w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                          isSelected ? 'bg-slate-800/70' : 'hover:bg-slate-850'
                        }`}
                      >
                        {isSelected && <span className="absolute inset-y-0 left-0 w-0.5 bg-brand-500" />}
                        <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isUnread ? 'bg-brand-400' : 'bg-transparent'}`} />
                          <span className={`flex-1 truncate text-sm ${isUnread ? 'font-semibold text-slate-50' : 'font-medium text-slate-300'}`}>
                            {from.name}
                          </span>
                          <span className="shrink-0 text-xs text-slate-500 tabular-nums">{formatListDate(email.created_at)}</span>
                        </div>
                        <p className={`mt-1 pl-3.5 truncate text-sm ${isUnread ? 'text-slate-100' : 'text-slate-300'}`}>
                          {email.subject || '(no subject)'}
                        </p>
                        <p className="mt-0.5 pl-3.5 truncate text-xs text-slate-500">{previewOf(email.body)}</p>
                        {email.from_spam && (
                          <span className="badge badge-warning mt-2 ml-3.5" title="Gmail put this in Spam. Check it before adding it to the pipeline.">
                            From spam
                          </span>
                        )}
                        {!isUnread && STATUS_BADGE[email.status] && (
                          <span className={`${STATUS_BADGE[email.status].className} mt-2 ml-3.5`}>
                            {STATUS_BADGE[email.status].label}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Reading pane */}
        <section className="flex-1 min-w-0 flex flex-col" aria-label="Message">
          {selectedEmail && sender ? (
            <>
              <div className="px-8 py-5 border-b border-slate-800 shrink-0">
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-slate-50 leading-snug">
                      {selectedEmail.subject || '(no subject)'}
                    </h2>
                    {selectedEmail.from_spam && (
                      <p className="mt-1.5 text-xs text-amber-300">
                        Found in your mailbox's Spam folder. Check it's a real enquiry before adding it to the pipeline.
                      </p>
                    )}
                  </div>
                  {(selectedEmail.status === 'unread' || selectedEmail.status === 'read') && (
                    <button
                      onClick={() => handleTransfer(selectedEmail.id)}
                      disabled={processing}
                      className="btn btn-primary shrink-0"
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                      Add to pipeline
                    </button>
                  )}
                  {selectedEmail.status === 'imported' && (
                    <button onClick={() => navigate('/workspace')} className="btn btn-secondary shrink-0">
                      Open pipeline
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-slate-800 text-slate-200 text-sm font-semibold flex items-center justify-center">
                    {sender.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">{sender.name}</p>
                    <p className="truncate text-xs text-slate-500">{sender.address}</p>
                  </div>
                  {STATUS_BADGE[selectedEmail.status] && (
                    <span className={STATUS_BADGE[selectedEmail.status].className}>
                      {STATUS_BADGE[selectedEmail.status].label}
                    </span>
                  )}
                  <time className="shrink-0 text-xs text-slate-500">
                    {new Date(selectedEmail.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </time>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl px-8 py-6 space-y-6">
                  {notice && (
                    <div className={`alert ${notice.tone === 'success' ? 'alert-success' : 'alert-warning'}`} role="status">
                      {notice.tone === 'success' && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
                      <p>{notice.text}</p>
                    </div>
                  )}

                  <article className="break-words">{renderEmailBody(selectedEmail.body)}</article>

                  {(selectedEmail.status === 'unread' || selectedEmail.status === 'read') && (
                    <p className="text-xs text-slate-500 border-t border-slate-800 pt-4">
                      Add this message to the pipeline to price it. You can reply once it has been added.
                    </p>
                  )}

                  {selectedEmail.status === 'replied' && (
                    <div className="alert alert-info">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" />
                      <p>You replied to this message. Nothing else is needed.</p>
                    </div>
                  )}
                </div>
              </div>

              {selectedEmail.status === 'imported' && (
                <div className="border-t border-slate-800 bg-slate-900/40 px-8 py-4 shrink-0">
                  <div className="max-w-3xl">
                    <label htmlFor="reply" className="label">
                      Reply to {sender.address}
                    </label>
                    <textarea
                      id="reply"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={5}
                      placeholder="Write your reply, or paste the quote drafted in Pipeline."
                      className="input resize-y min-h-[112px] leading-6"
                    />
                    <div className="mt-3 flex items-center justify-between">
                      <button onClick={handleCopy} disabled={!replyText.trim()} className="btn btn-ghost btn-sm">
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? 'Copied' : 'Copy text'}
                      </button>
                      <button
                        onClick={() => handleReply(selectedEmail.id)}
                        disabled={processing || !replyText.trim()}
                        className="btn btn-primary"
                      >
                        {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Send reply
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState icon={Mail} title="Select a message" description="Choose a message on the left to read it and reply." />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
