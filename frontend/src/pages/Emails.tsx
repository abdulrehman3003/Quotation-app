import React, { useEffect, useState } from 'react'
import { useWorkspaceStore, CustomerEmail } from '../store/workspaceStore'
import { Mail, ArrowRight, CheckCircle, Send, Loader2, Inbox, ExternalLink, Copy, AtSign, RefreshCw } from 'lucide-react'

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

// Main email body renderer — handles separators, blank lines, URLs, invisible chars
function renderEmailBody(rawBody: string): React.ReactNode {
  if (!rawBody) return null

  // Normalize literal \n escape sequences into real newlines, then strip invisibles
  const normalized = stripInvisible(rawBody.replace(/\\n/g, '\n').replace(/\\r/g, ''))
  const lines = normalized.split('\n')

  const elements: React.ReactNode[] = []
  let key = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Detect separator lines: 3+ dashes or equals signs
    if (/^[-=]{3,}$/.test(trimmed)) {
      elements.push(
        <div key={key++} className="border-t border-slate-700/60 my-3" />
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
          className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2 break-all transition-colors my-0.5"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          {label}
        </a>
      )
    } else {
      elements.push(
        <p key={key++} className="text-sm text-slate-300 leading-relaxed">
          {tokens.map((token, ti) =>
            token.type === 'url' ? (
              <a
                key={ti}
                href={token.content}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors break-all"
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

export default function Emails() {
  const { 
    emails, 
    loadingEmails, 
    fetchEmails, 
    transferEmail, 
    replyEmail, 
    error 
  } = useWorkspaceStore()

  const [selectedEmail, setSelectedEmail] = useState<CustomerEmail | null>(null)
  const [replyText, setReplyText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchEmails()
  }, [fetchEmails])

  // Sync selected email status updates
  useEffect(() => {
    if (selectedEmail) {
      const updated = emails.find(e => e.id === selectedEmail.id)
      if (updated) {
        setSelectedEmail(updated)
      }
    }
  }, [emails, selectedEmail])

  const handleTransfer = async (id: string) => {
    setProcessing(true)
    setSuccessMessage(null)
    try {
      await transferEmail(id)
      setSuccessMessage("Successfully transferred email to leads workspace pipeline!")
    } catch (err) {
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const handleReply = async (id: string) => {
    if (!replyText.trim()) return
    setProcessing(true)
    setSuccessMessage(null)
    try {
      const result = await replyEmail(id, replyText)
      setReplyText('')
      // Show whether it was real SMTP or simulated
      const to = selectedEmail?.sender_email || 'the customer'
      if (result?.sent) {
        setSuccessMessage(`✅ Email dispatched via Gmail SMTP to ${to}`)
      } else {
        setSuccessMessage(`📋 Reply logged (no Gmail credentials configured). To send real emails, set GMAIL_EMAIL and GMAIL_APP_PASSWORD in .env.`)
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

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Top Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Mail className="h-5 w-5 text-indigo-400" />
            Client Email Inbox
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Simulate and handle B2B pricing requests arriving via email.
          </p>
        </div>

        <button
          onClick={() => fetchEmails()}
          className="px-4 py-2 border border-slate-800 hover:border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
        >
          <RefreshCw className={`h-4.5 w-4.5 ${loadingEmails ? 'animate-spin' : ''}`} />
          Refresh Inbox
        </button>
      </div>

      {/* Main Grid Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Inbox List */}
        <div className="w-1/3 border-r border-slate-800 flex flex-col bg-slate-900/20 overflow-y-auto">
          {error && (
            <div className="p-3 m-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">
              {error}
            </div>
          )}
          {loadingEmails ? (
            <div className="divide-y divide-slate-800/60">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 space-y-3 animate-pulse">
                  <div className="flex justify-between items-center">
                    <div className="h-3 bg-slate-800 rounded w-1/3"></div>
                    <div className="h-4 bg-slate-850 rounded w-12"></div>
                  </div>
                  <div className="h-4 bg-slate-800 rounded w-3/4"></div>
                  <div className="h-3 bg-slate-850 rounded w-5/6"></div>
                </div>
              ))}
            </div>
          ) : emails.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-500 text-center">
              <Inbox className="h-8 w-8 mb-2 stroke-[1.5]" />
              <p className="text-sm">Your simulated email feed is empty.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {emails.map((email) => {
                const isSelected = selectedEmail?.id === email.id
                return (
                  <button
                    key={email.id}
                    onClick={() => {
                      setSelectedEmail(email)
                      setSuccessMessage(null)
                      setReplyText('')
                    }}
                    className={`w-full text-left p-4 transition-all duration-200 ${
                      isSelected 
                        ? 'bg-slate-800/80 border-l-4 border-indigo-500' 
                        : 'hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-400 truncate max-w-[150px]">
                        {email.sender_email}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        email.status === 'unread' 
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : email.status === 'imported'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-green-500/10 text-green-400 border border-green-500/20'
                      }`}>
                        {email.status.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-white mt-1.5 truncate">
                      {email.subject}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {email.body ? email.body.replace(/\\n/g, ' ') : ''}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Right Side: Email Reader & Actions */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-y-auto p-6">
          {selectedEmail ? (
            <div className="max-w-3xl flex flex-col gap-6">
              {/* Alert Message Banner */}
              {(successMessage || error) && (
                <div className={`p-4 rounded-lg flex items-center gap-3 text-sm ${
                  error 
                    ? 'bg-red-500/10 border border-red-500/20 text-red-400' 
                    : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                }`}>
                  {error ? (
                    <p>{error}</p>
                  ) : (
                    <>
                      <CheckCircle className="h-5 w-5 shrink-0" />
                      <p>{successMessage}</p>
                    </>
                  )}
                </div>
              )}

              {/* Email Content Panel */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 shadow-xl backdrop-blur-sm">
                <div className="flex flex-col gap-1 border-b border-slate-800 pb-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>From: <strong>{selectedEmail.sender_email}</strong></span>
                    <span>Received: {new Date(selectedEmail.created_at).toLocaleString()}</span>
                  </div>
                  <h2 className="text-lg font-bold text-white mt-2">
                    {selectedEmail.subject}
                  </h2>
                </div>

                <div className="mt-4">
                  {renderEmailBody(selectedEmail.body)}
                </div>
              </div>

              {/* Action Section */}
              <div className="flex flex-col gap-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                  Actions Pipeline
                </h3>

                {selectedEmail.status === 'unread' && (
                  <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-5 flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Transfer to Lead Pipeline</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Import this email directly into your workspace feed to calculate costs.
                      </p>
                    </div>
                    <button
                      onClick={() => handleTransfer(selectedEmail.id)}
                      disabled={processing}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                      {processing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          Import Lead
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>
                )}

                {selectedEmail.status === 'imported' && (
                  <div className="flex flex-col gap-4">
                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-5">
                      <h4 className="text-sm font-semibold text-amber-400">Lead is Active in Workspace</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        We have successfully generated a lead card for this email. Use the **Workspace** dashboard to edit items, run the pricing calculation model, and structure the official quote response template.
                      </p>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-white">Send Response Email</h4>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/60 rounded-full px-3 py-1">
                          <AtSign className="h-3 w-3" />
                          <span className="truncate max-w-[180px]">{selectedEmail.sender_email}</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400">
                        Type or paste your quotation reply below. It will be sent directly to <strong className="text-slate-300">{selectedEmail.sender_email}</strong> via Gmail.
                      </p>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={`Dear ${selectedEmail.sender_email.split('@')[0]},\n\nThank you for reaching out. Please find the quotation breakdown below:\n\n...`}
                        className="w-full min-h-[200px] bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                      />
                      <div className="flex items-center justify-between mt-1">
                        <button
                          onClick={handleCopy}
                          disabled={!replyText.trim()}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-2 transition-all disabled:opacity-40"
                        >
                          {copied ? (
                            <><CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Copied!</>
                          ) : (
                            <><Copy className="h-3.5 w-3.5" /> Copy to Clipboard</>
                          )}
                        </button>
                        <button
                          onClick={() => handleReply(selectedEmail.id)}
                          disabled={processing || !replyText.trim()}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                          {processing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              Send to {selectedEmail.sender_email.split('@')[0]}
                              <Send className="h-4 w-4" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {selectedEmail.status === 'replied' && (
                  <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-5 flex items-center gap-3">
                    <CheckCircle className="text-emerald-400 h-6 w-6 shrink-0" />
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-400">Quotation Process Complete</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        The reply has been successfully dispatched to the client. No further actions are required.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <Mail className="h-10 w-10 mb-2 stroke-[1.5]" />
              <p className="text-sm">Select an email from the list to view specifications.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
