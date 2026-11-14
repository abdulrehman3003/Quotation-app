import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '../store/workspaceStore'
import { AlertTriangle, Building2, Calculator, Check, CheckCircle, CheckCircle2, Copy, Key, Link2, Loader2, Mail, Phone, ShieldAlert, Sparkles, User, Users } from 'lucide-react'
import PageHeader from '../components/PageHeader'

export default function UserProfileSettings() {
  const navigate = useNavigate()
  const { userProfile, teamInfo, fetchProfile, updateProfile, fetchTeam, changePassword, automation, fetchAutomation, saveAutomation, mailConnection, fetchMailConnection, startMailConnect, disconnectMail } = useWorkspaceStore()

  // Personal & Company
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [phone, setPhone] = useState('')

  // Quotation Defaults
  const [currency, setCurrency] = useState('USD')
  const [baseLaborRate, setBaseLaborRate] = useState('50.00')
  const [baseMaterialMarkup, setBaseMaterialMarkup] = useState('1.20')
  const [paymentTerms, setPaymentTerms] = useState('Net 30 days. Quote valid for 14 days.')
  const [taxPercent, setTaxPercent] = useState('0')
  const [validityDays, setValidityDays] = useState('30')

  // Self-service Encrypted Integrations
  const [geminiKey, setGeminiKey] = useState('')
  const [gmailEmail, setGmailEmail] = useState('')
  const [gmailPassword, setGmailPassword] = useState('')
  const [twilioSid, setTwilioSid] = useState('')
  const [twilioToken, setTwilioToken] = useState('')
  const [twilioPhone, setTwilioPhone] = useState('')

  // Password Change
  const [currentPassword, setCurrentPassword] = useState('')
  const [mailMessage, setMailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchMailConnection()
    // Result of returning from Google / Microsoft sign-in
    const result = new URLSearchParams(window.location.search).get('mail')
    if (result === 'connected') setMailMessage({ type: 'success', text: 'Mailbox connected.' })
    else if (result === 'cancelled') setMailMessage({ type: 'error', text: 'Sign-in was cancelled. No mailbox was connected.' })
    else if (result === 'error') setMailMessage({ type: 'error', text: 'The mailbox could not be connected. Please try again.' })
    if (result) window.history.replaceState({}, '', window.location.pathname)
  }, [fetchMailConnection])

  const handleMailConnect = async (provider: string) => {
    setMailMessage(null)
    try {
      await startMailConnect(provider)
    } catch (err: any) {
      setMailMessage({ type: 'error', text: err.message })
    }
  }

  const handleMailDisconnect = async () => {
    setMailMessage(null)
    try {
      await disconnectMail()
      setMailMessage({ type: 'success', text: 'Mailbox disconnected.' })
    } catch (err: any) {
      setMailMessage({ type: 'error', text: err.message })
    }
  }

  const [autoDraft, setAutoDraft] = useState(false)
  const [autoFollowUp, setAutoFollowUp] = useState(false)
  const [followUpDays, setFollowUpDays] = useState('3')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [automationMessage, setAutomationMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [savingAutomation, setSavingAutomation] = useState(false)

  useEffect(() => {
    fetchAutomation()
  }, [fetchAutomation])

  useEffect(() => {
    if (!automation) return
    setAutoDraft(automation.auto_draft_quotes)
    setAutoFollowUp(automation.auto_follow_up)
    setFollowUpDays(String(automation.follow_up_after_days || 3))
    setWebhookUrl(automation.webhook_url || '')
  }, [automation])

  const handleSaveAutomation = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingAutomation(true)
    setAutomationMessage(null)
    try {
      await saveAutomation({
        auto_draft_quotes: autoDraft,
        auto_follow_up: autoFollowUp,
        follow_up_after_days: Math.min(Math.max(Math.round(Number(followUpDays)) || 3, 1), 30),
        webhook_url: webhookUrl.trim(),
      })
      setAutomationMessage({ type: 'success', text: 'Automation settings saved.' })
    } catch (err: any) {
      setAutomationMessage({ type: 'error', text: err.message || 'Failed to save automation settings.' })
    } finally {
      setSavingAutomation(false)
    }
  }

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Team Invite Copy State
  const [copiedInvite, setCopiedInvite] = useState(false)

  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusType, setStatusType] = useState<'success' | 'error'>('success')

  useEffect(() => {
    fetchProfile()
      .then((profile) => {
        if (profile) {
          setName(profile.name || '')
          setCompanyName(profile.company_name || '')
          setPhone(profile.phone_number || '')
          const params = profile.default_quote_parameters || {}
          if (params.currency) setCurrency(params.currency)
          if (params.base_labor_rate) setBaseLaborRate(String(params.base_labor_rate))
          if (params.base_material_markup) setBaseMaterialMarkup(String(params.base_material_markup))
          if (params.payment_terms) setPaymentTerms(params.payment_terms)
          if (params.tax_percent != null) setTaxPercent(String(params.tax_percent))
          if (params.quote_validity_days) setValidityDays(String(params.quote_validity_days))
          if (profile.gmail_email) setGmailEmail(profile.gmail_email)
          if (profile.twilio_phone) setTwilioPhone(profile.twilio_phone)
        }
      })
      .catch(console.error)

    fetchTeam().catch(console.error)
  }, [fetchProfile, fetchTeam])

  const inviteLink = teamInfo?.invite_token
    ? `${window.location.origin}/auth?invite=${encodeURIComponent(teamInfo.invite_token)}`
    : ''

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopiedInvite(true)
      setTimeout(() => setCopiedInvite(false), 2500)
    } catch {
      setStatusType('error')
      setStatusMessage('Failed to copy invite link. Please copy it manually.')
    }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setStatusMessage(null)
    try {
      await updateProfile({
        name,
        company_name: companyName,
        phone_number: phone,
        default_quote_parameters: {
          ...(userProfile?.default_quote_parameters || {}),
          company_name: companyName,
          currency,
          base_labor_rate: Number(baseLaborRate) || 50.0,
          base_material_markup: Number(baseMaterialMarkup) || 1.2,
          payment_terms: paymentTerms,
          tax_percent: Math.min(Math.max(Number(taxPercent) || 0, 0), 100),
          quote_validity_days: Math.min(Math.max(Math.round(Number(validityDays)) || 30, 1), 365)
        }
      })
      await fetchTeam().catch(() => {})
      setStatusType('success')
      setStatusMessage('Workspace profile and quotation defaults updated successfully.')
    } catch (err: any) {
      setStatusType('error')
      setStatusMessage(err.message || 'Failed to update profile.')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateIntegrations = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setStatusMessage(null)
    try {
      const payload: any = {}
      if (geminiKey.trim()) payload.gemini_key = geminiKey.trim()
      if (gmailEmail.trim()) payload.gmail_email = gmailEmail.trim()
      if (gmailPassword.trim()) payload.gmail_password = gmailPassword.trim()
      if (twilioSid.trim()) payload.twilio_sid = twilioSid.trim()
      if (twilioToken.trim()) payload.twilio_token = twilioToken.trim()
      if (twilioPhone.trim()) payload.twilio_phone = twilioPhone.trim()

      await updateProfile(payload)
      setGeminiKey('')
      setGmailPassword('')
      setTwilioToken('')
      setStatusType('success')
      setStatusMessage('Encrypted API keys and channel credentials saved.')
    } catch (err: any) {
      setStatusType('error')
      setStatusMessage(err.message || 'Failed to update integration credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setStatusType('error')
      setStatusMessage('Passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setStatusType('error')
      setStatusMessage('Password must be at least 8 characters long.')
      return
    }
    setLoading(true)
    setStatusMessage(null)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setStatusType('success')
      setStatusMessage('Password changed successfully.')
    } catch (err: any) {
      setStatusType('error')
      setStatusMessage(err.message || 'Failed to change password.')
    } finally {
      setLoading(false)
    }
  }

  const Status: React.FC<{ on: boolean }> = ({ on }) => (
    <span className={`badge ${on ? 'badge-success' : 'badge-neutral'}`}>{on ? 'Connected' : 'Not connected'}</span>
  )

  const gmailConnected = !!mailConnection?.connection || !!(userProfile?.has_gmail_email && userProfile?.has_gmail_password)
  const twilioConnected = !!(userProfile?.has_twilio_sid && userProfile?.has_twilio_token && userProfile?.has_twilio_phone)

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <PageHeader
        title="Settings"
        description="Your profile, quote defaults, team and connected channels."
        actions={
          <button type="button" onClick={() => navigate('/onboarding')} className="btn btn-secondary">
            Run setup guide
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
          {statusMessage && (
            <div className={`alert ${statusType === 'error' ? 'alert-error' : 'alert-success'}`} role="status">
              {statusType === 'error' ? (
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <p>{statusMessage}</p>
            </div>
          )}

          {/* Profile and quote defaults */}
          <form onSubmit={handleUpdateProfile} className="card">
            <div className="px-5 py-4 border-b border-slate-800">
              <h2 className="section-title">Profile</h2>
              <p className="mt-0.5 text-xs text-slate-500">Shown to your team and used to sign your quotes.</p>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="set-email" className="label">Account email</label>
                <input id="set-email" type="email" value={userProfile?.email || ''} disabled readOnly className="input" />
              </div>
              <div>
                <label htmlFor="set-company" className="label">Company name</label>
                <input
                  id="set-company"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Apex Fabrication LLC"
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="set-name" className="label">Full name</label>
                <input id="set-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" />
              </div>
              <div>
                <label htmlFor="set-phone" className="label">Phone number</label>
                <input
                  id="set-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 234 5678"
                  className="input"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-y border-slate-800">
              <h2 className="section-title">Quote defaults</h2>
              <p className="mt-0.5 text-xs text-slate-500">Applied to every new quote. You can still edit each quote before sending.</p>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="set-currency" className="label">Currency</label>
                <select id="set-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="input">
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CAD">CAD ($)</option>
                  <option value="AUD">AUD ($)</option>
                  <option value="AED">AED</option>
                  <option value="PKR">PKR</option>
                </select>
              </div>
              <div>
                <label htmlFor="set-labor" className="label">Labour rate per hour</label>
                <input
                  id="set-labor"
                  type="number"
                  step="0.01"
                  min={0}
                  value={baseLaborRate}
                  onChange={(e) => setBaseLaborRate(e.target.value)}
                  className="input tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="set-markup" className="label">Material markup (multiplier)</label>
                <input
                  id="set-markup"
                  type="number"
                  step="0.01"
                  min={0}
                  value={baseMaterialMarkup}
                  onChange={(e) => setBaseMaterialMarkup(e.target.value)}
                  className="input tabular-nums"
                />
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="set-terms" className="label">Payment and validity terms</label>
                <input id="set-terms" type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="input" />
              </div>
              <div>
                <label htmlFor="set-tax" className="label">Default tax (%)</label>
                <input
                  id="set-tax"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                  className="input tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="set-validity" className="label">Quotes valid for (days)</label>
                <input
                  id="set-validity"
                  type="number"
                  step="1"
                  min={1}
                  max={365}
                  value={validityDays}
                  onChange={(e) => setValidityDays(e.target.value)}
                  className="input tabular-nums"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-800 flex justify-end">
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </button>
            </div>
          </form>

          {/* Connected channels */}
          <form onSubmit={handleUpdateIntegrations} className="card">
            <div className="px-5 py-4 border-b border-slate-800">
              <h2 className="section-title">Connections</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Keys and passwords are encrypted before they are stored. Leave a field blank to keep the saved value.
              </p>
            </div>

            <div className="p-5 space-y-3 border-b border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-slate-100">Assistant</h3>
                  <p className="text-xs text-slate-500">Gemini API key used to price requests and draft replies.</p>
                </div>
                <Status on={!!userProfile?.has_gemini_key} />
              </div>
              <div>
                <label htmlFor="set-gemini" className="label">Gemini API key</label>
                <input
                  id="set-gemini"
                  type="password"
                  autoComplete="off"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder={userProfile?.has_gemini_key ? 'Saved' : ''}
                  className="input font-mono"
                />
              </div>
            </div>

            <div id="email" className="p-5 space-y-3 border-b border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-slate-100">Email</h3>
                  <p className="text-xs text-slate-500">
                    Inbox to read enquiries from and send quotes with. Sign in with Google or Microsoft, or use a Gmail app password below.
                  </p>
                </div>
                <Status on={gmailConnected} />
              </div>

              {mailMessage && (
                <div className={`alert ${mailMessage.type === 'success' ? 'alert-success' : 'alert-error'}`} role="status">
                  <p>{mailMessage.text}</p>
                </div>
              )}

              {mailConnection?.connection ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950 px-3 py-2.5">
                  <p className="text-sm text-slate-200">
                    <span className="capitalize">{mailConnection.connection.provider}</span> mailbox{' '}
                    <span className="font-medium">{mailConnection.connection.email}</span> is connected for your workspace.
                  </p>
                  <button type="button" onClick={handleMailDisconnect} className="btn btn-danger btn-sm">Disconnect</button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {(['google', 'microsoft'] as const).map((provider) => {
                    const configured = !!mailConnection?.providers?.[provider]?.configured
                    return (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => handleMailConnect(provider)}
                        disabled={!configured}
                        title={configured ? '' : 'Not set up on the server yet'}
                        className="btn btn-secondary"
                      >
                        <Mail className="h-4 w-4" />
                        {provider === 'google' ? 'Sign in with Google' : 'Sign in with Microsoft (Outlook / 365)'}
                      </button>
                    )
                  })}
                  {mailConnection && !mailConnection.providers?.google?.configured && !mailConnection.providers?.microsoft?.configured && (
                    <p className="w-full text-xs text-slate-500">
                      Sign-in is not set up on the server yet (OAuth client IDs are missing), so only the app password option works for now.
                    </p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="set-gmail" className="label">Gmail address</label>
                  <input
                    id="set-gmail"
                    type="email"
                    value={gmailEmail}
                    onChange={(e) => setGmailEmail(e.target.value)}
                    placeholder="sales@company.com"
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="set-gmail-pw" className="label">App password</label>
                  <input
                    id="set-gmail-pw"
                    type="password"
                    autoComplete="off"
                    value={gmailPassword}
                    onChange={(e) => setGmailPassword(e.target.value)}
                    placeholder={userProfile?.has_gmail_password ? 'Saved' : '16 characters'}
                    className="input font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-slate-100">WhatsApp</h3>
                  <p className="text-xs text-slate-500">Twilio account and WhatsApp sender number.</p>
                </div>
                <Status on={twilioConnected} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="set-sid" className="label">Account SID</label>
                  <input
                    id="set-sid"
                    type="text"
                    autoComplete="off"
                    value={twilioSid}
                    onChange={(e) => setTwilioSid(e.target.value)}
                    placeholder={userProfile?.has_twilio_sid ? 'Saved' : 'AC…'}
                    className="input font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="set-token" className="label">Auth token</label>
                  <input
                    id="set-token"
                    type="password"
                    autoComplete="off"
                    value={twilioToken}
                    onChange={(e) => setTwilioToken(e.target.value)}
                    placeholder={userProfile?.has_twilio_token ? 'Saved' : ''}
                    className="input font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="set-wa" className="label">WhatsApp number</label>
                  <input
                    id="set-wa"
                    type="text"
                    value={twilioPhone}
                    onChange={(e) => setTwilioPhone(e.target.value)}
                    placeholder={userProfile?.has_twilio_phone ? 'Saved' : '+14155238886'}
                    className="input font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-800 flex justify-end">
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Save connections
              </button>
            </div>
          </form>

          {/* Team */}
          <section className="card">
            <div className="px-5 py-4 border-b border-slate-800">
              <h2 className="section-title">Team</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Anyone who signs up with this link joins {teamInfo?.company_name || companyName || 'your company'} and shares its
                leads, knowledge base and quotes.
              </p>
            </div>
            <div className="p-5">
              <label htmlFor="set-invite" className="label">Invite link</label>
              <div className="flex gap-2">
                <input id="set-invite" type="text" readOnly value={inviteLink || 'Generating link…'} className="input font-mono text-xs" />
                <button type="button" onClick={handleCopyInviteLink} disabled={!inviteLink} className="btn btn-secondary shrink-0">
                  {copiedInvite ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copiedInvite ? 'Copied' : 'Copy link'}
                </button>
              </div>
            </div>
            <ul className="border-t border-slate-800 divide-y divide-slate-800">
              {(teamInfo?.members || []).map((member) => (
                <li key={member.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="h-8 w-8 shrink-0 rounded-full bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center">
                    {(member.name || member.email || '?').charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-100">
                      {member.name || member.email?.split('@')[0] || 'Team member'}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{member.email}</span>
                  </span>
                  <span className="badge badge-neutral capitalize">{member.role || 'member'}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Automation */}
          <form onSubmit={handleSaveAutomation} className="card">
            <div className="px-5 py-4 border-b border-slate-800">
              <h2 className="section-title">Automation</h2>
              <p className="mt-0.5 text-xs text-slate-500">Applies to everyone in your workspace. All of these are off until you turn them on.</p>
            </div>
            <div className="p-5 space-y-5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={autoDraft} onChange={(e) => setAutoDraft(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-500" />
                <span>
                  <span className="block text-sm font-medium text-slate-100">Draft quotes automatically from incoming email</span>
                  <span className="block text-xs text-slate-500">
                    New customer emails become leads with an AI-drafted quote waiting in the pipeline. Nothing is sent until you review and send it. Uses your Gemini quota (up to 5 emails per check).
                  </span>
                </span>
              </label>

              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={autoFollowUp} onChange={(e) => setAutoFollowUp(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-500" />
                  <span>
                    <span className="block text-sm font-medium text-slate-100">Send one follow-up email on unanswered quotes</span>
                    <span className="block text-xs text-slate-500">
                      Emails the customer once from your connected mailbox if a sent quote has no answer. Never sent for won, lost or expired quotes.
                    </span>
                  </span>
                </label>
                {autoFollowUp && (
                  <div className="mt-3 ml-7 max-w-[180px]">
                    <label htmlFor="set-followup-days" className="label">Send after (days)</label>
                    <input
                      id="set-followup-days"
                      type="number"
                      min={1}
                      max={30}
                      step="1"
                      value={followUpDays}
                      onChange={(e) => setFollowUpDays(e.target.value)}
                      className="input tabular-nums"
                    />
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="set-webhook" className="label">Webhook URL (CRM / ERP / Zapier)</label>
                <input
                  id="set-webhook"
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://example.com/hooks/quotes"
                  className="input"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Receives a JSON POST when a quote is sent, accepted or declined. Leave empty to turn off.
                </p>
                {automation?.webhook_url && automation.webhook_secret && (
                  <p className="mt-2 text-xs text-slate-400 break-all">
                    Signing secret: <code className="font-mono text-slate-200">{automation.webhook_secret}</code>
                    <span className="block text-slate-500">Each request carries X-Webhook-Signature: sha256=HMAC(secret, body).</span>
                  </p>
                )}
              </div>

              {automationMessage && (
                <div className={`alert ${automationMessage.type === 'success' ? 'alert-success' : 'alert-error'}`} role="status">
                  <p>{automationMessage.text}</p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-800 flex justify-end">
              <button type="submit" disabled={savingAutomation} className="btn btn-secondary">
                {savingAutomation && <Loader2 className="h-4 w-4 animate-spin" />}
                Save automation
              </button>
            </div>
          </form>

          {/* Password */}
          <form onSubmit={handleChangePassword} className="card">
            <div className="px-5 py-4 border-b border-slate-800">
              <h2 className="section-title">Password</h2>
              <p className="mt-0.5 text-xs text-slate-500">Use at least 8 characters.</p>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
                <label htmlFor="set-pw-current" className="label">Current password</label>
                <input
                  id="set-pw-current"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="set-pw" className="label">New password</label>
                <input
                  id="set-pw"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="set-pw2" className="label">Confirm new password</label>
                <input
                  id="set-pw2"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-800 flex justify-end">
              <button type="submit" disabled={loading || !newPassword} className="btn btn-secondary">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Update password
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
