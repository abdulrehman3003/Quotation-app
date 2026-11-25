import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useWorkspaceStore } from '../store/workspaceStore'
import { FileUploader } from '../components/FileUploader'
import {
  Building2,
  User,
  Phone,
  Calculator,
  Key,
  Mail,
  MessageSquare,
  Database,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  AlertTriangle,
  Loader2,
  FileSpreadsheet
} from 'lucide-react'

// Form fields kept across the Google / Microsoft sign-in redirect (secrets are never stored).
const DRAFT_KEY = 'axr_onboarding_draft'
type OnboardingDraft = Record<string, string>

const readDraft = (): OnboardingDraft | null => {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const MAIL_RESULT_MESSAGES: Record<string, { type: 'success' | 'error'; text: string }> = {
  connected: { type: 'success', text: 'Mailbox connected.' },
  cancelled: { type: 'error', text: 'Sign-in was cancelled. No mailbox was connected.' },
  in_use: { type: 'error', text: 'That mailbox is already used by another company. Each company needs its own mailbox.' },
  error: { type: 'error', text: 'The mailbox could not be connected. Please try again.' }
}

const STEPS = [
  { id: 1, title: 'Company & Profile', subtitle: 'Workspace identity', icon: Building2 },
  { id: 2, title: 'Quotation Defaults', subtitle: 'Rates & margins', icon: Calculator },
  { id: 3, title: 'AI & Channels', subtitle: 'Optional integrations', icon: Key },
  { id: 4, title: 'Knowledge Base', subtitle: 'Pricing sheet setup', icon: Database }
]

export const Onboarding: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    userProfile,
    kbFiles,
    fetchProfile,
    fetchKbFiles,
    completeOnboarding,
    uploadKbFile,
    seedSampleKb,
    mailConnection,
    fetchMailConnection,
    startMailConnect,
    disconnectMail
  } = useWorkspaceStore()

  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [seedingSample, setSeedingSample] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [sampleLoadedMsg, setSampleLoadedMsg] = useState<string | null>(null)

  // Step 1 fields
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [industry, setIndustry] = useState('Metal Fabrication & CNC Machining')

  // Step 2 fields
  const [currency, setCurrency] = useState('USD')
  const [baseLaborRate, setBaseLaborRate] = useState('50.00')
  const [baseMaterialMarkup, setBaseMaterialMarkup] = useState('1.20')
  const [paymentTerms, setPaymentTerms] = useState('Net 30 days. Quote valid for 14 days.')

  // Step 3 fields (optional)
  const [geminiKey, setGeminiKey] = useState('')
  const [gmailEmail, setGmailEmail] = useState('')
  const [gmailPassword, setGmailPassword] = useState('')
  const [twilioSid, setTwilioSid] = useState('')
  const [twilioToken, setTwilioToken] = useState('')
  const [twilioPhone, setTwilioPhone] = useState('')
  const [mailMessage, setMailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [mailBusy, setMailBusy] = useState(false)

  useEffect(() => {
    fetchProfile()
      .then((profile) => {
        if (profile) {
          const meta = user?.user_metadata || {}
          setName(profile.name || meta.full_name || '')
          setCompanyName(
            profile.company_name ||
              meta.company_name ||
              (profile.email ? `${profile.email.split('@')[0]}'s Workspace` : '')
          )
          setPhoneNumber(profile.phone_number || '')
          const params = profile.default_quote_parameters || {}
          if (params.industry) setIndustry(params.industry)
          if (params.currency) setCurrency(params.currency)
          if (params.base_labor_rate) setBaseLaborRate(String(params.base_labor_rate))
          if (params.base_material_markup) setBaseMaterialMarkup(String(params.base_material_markup))
          if (params.payment_terms) setPaymentTerms(params.payment_terms)
          if (profile.gmail_email) setGmailEmail(profile.gmail_email)
          if (profile.twilio_phone) setTwilioPhone(profile.twilio_phone)
        }
        // Coming back from mailbox sign-in: restore what was typed before leaving.
        const draft = readDraft()
        if (draft) {
          const setters: Record<string, (v: string) => void> = {
            name: setName, companyName: setCompanyName, phoneNumber: setPhoneNumber, industry: setIndustry,
            currency: setCurrency, baseLaborRate: setBaseLaborRate, baseMaterialMarkup: setBaseMaterialMarkup,
            paymentTerms: setPaymentTerms, twilioSid: setTwilioSid, twilioPhone: setTwilioPhone
          }
          Object.entries(draft).forEach(([k, v]) => setters[k]?.(v))
          try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
        }
      })
      .catch(() => {})
    fetchKbFiles().catch(() => {})
    fetchMailConnection()
  }, [fetchProfile, fetchKbFiles, fetchMailConnection, user])

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('mail')
    if (!result) return
    setStep(3)
    setMailMessage(MAIL_RESULT_MESSAGES[result] || MAIL_RESULT_MESSAGES.error)
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  const handleMailConnect = async (provider: string) => {
    setMailMessage(null)
    setMailBusy(true)
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        name, companyName, phoneNumber, industry, currency, baseLaborRate,
        baseMaterialMarkup, paymentTerms, twilioSid, twilioPhone
      }))
    } catch { /* the wizard still works; typed fields would need re-entering */ }
    try {
      await startMailConnect(provider, 'onboarding')
    } catch (err: any) {
      try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      setMailMessage({ type: 'error', text: err.message || 'Could not start the sign-in.' })
      setMailBusy(false)
    }
  }

  const handleMailDisconnect = async () => {
    setMailMessage(null)
    setMailBusy(true)
    try {
      await disconnectMail()
      setMailMessage({ type: 'success', text: 'Mailbox disconnected.' })
    } catch (err: any) {
      setMailMessage({ type: 'error', text: err.message || 'Could not disconnect the mailbox.' })
    } finally {
      setMailBusy(false)
    }
  }

  const ssoProviders = ['google', 'microsoft'] as const
  const ssoConfigured = (p: string) => !!mailConnection?.providers?.[p]?.configured
  const anySsoConfigured = ssoProviders.some(ssoConfigured)

  const validateCurrentStep = (): boolean => {
    setErrorMsg(null)
    if (step === 1) {
      if (!name.trim()) {
        setErrorMsg('Please enter your full name.')
        return false
      }
      if (!companyName.trim()) {
        setErrorMsg('Please enter your company or workspace name.')
        return false
      }
    }
    if (step === 2) {
      const labor = Number(baseLaborRate)
      const markup = Number(baseMaterialMarkup)
      if (!Number.isFinite(labor) || labor <= 0) {
        setErrorMsg('Base labor rate must be greater than 0.')
        return false
      }
      if (!Number.isFinite(markup) || markup <= 0) {
        setErrorMsg('Material markup multiplier must be greater than 0.')
        return false
      }
    }
    return true
  }

  const handleSaveAndAdvanceToKb = async () => {
    if (!validateCurrentStep()) return
    setSubmitting(true)
    setErrorMsg(null)
    try {
      await completeOnboarding({
        name: name.trim(),
        company_name: companyName.trim(),
        phone_number: phoneNumber.trim() || undefined,
        industry,
        currency,
        base_labor_rate: Number(baseLaborRate) || 50.0,
        base_material_markup: Number(baseMaterialMarkup) || 1.2,
        payment_terms: paymentTerms.trim(),
        gemini_key: geminiKey.trim() || undefined,
        gmail_email: gmailEmail.trim() || undefined,
        gmail_password: gmailPassword.trim() || undefined,
        twilio_sid: twilioSid.trim() || undefined,
        twilio_token: twilioToken.trim() || undefined,
        twilio_phone: twilioPhone.trim() || undefined
      })
      setStep(4)
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save onboarding settings.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleNext = async () => {
    if (!validateCurrentStep()) return
    if (step === 3) {
      await handleSaveAndAdvanceToKb()
      return
    }
    setStep((prev) => Math.min(4, prev + 1))
  }

  const handleLoadSampleKb = async () => {
    setSeedingSample(true)
    setErrorMsg(null)
    setSampleLoadedMsg(null)
    try {
      await seedSampleKb()
      setSampleLoadedMsg('Starter pricing catalog loaded into your Knowledge Base!')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load sample catalog.')
    } finally {
      setSeedingSample(false)
    }
  }

  const handleFinish = () => {
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-8 relative overflow-y-auto">
      {/* Subtle Background Glow */}
      <div className="w-full max-w-4xl z-10">
        {/* Top Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-xs font-semibold text-brand-400 mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Workspace Setup Wizard</span>
          </div>
          <h1 className="text-3xl font-semibold text-white tracking-tight">
            Configure Your AXRFLOWS Engine
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Set up your isolated tenant workspace, pricing rules, and communication channels in under 2 minutes.
          </p>
        </div>

        {/* Stepper Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {STEPS.map((s) => {
            const Icon = s.icon
            const isActive = step === s.id
            const isCompleted = step > s.id
            return (
              <div
                key={s.id}
                className={`p-3.5 rounded-lg border transition-colors flex items-center gap-3 ${
                  isActive
                    ? 'bg-brand-500/10 border-brand-500/50 text-white'
                    : isCompleted
                    ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-300'
                    : 'bg-slate-900/40 border-slate-800/80 text-slate-500'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isActive
                      ? 'bg-brand-500 text-white'
                      : isCompleted
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {isCompleted ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-semibold truncate">{s.title}</p>
                  <p className="text-[11px] text-slate-400 truncate">{s.subtitle}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Main Card */}
        <div className="p-6 sm:p-8 rounded-lg bg-slate-900/50 border border-slate-800">
          {errorMsg && (
            <div className="mb-6 p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: Company & Profile */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-white">1. Company & Profile Identity</h2>
                <p className="text-xs text-slate-400 mt-1">
                  This creates your dedicated, isolated company tenant and personalizes the signature on AI-drafted quotes.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="label">
                    Your Full Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      className="input pl-10 pr-4"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">
                    Company / Workspace Name *
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Apex Metalworks LLC"
                      className="input pl-10 pr-4"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">
                    Business Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+1 (555) 234-5678"
                      className="input pl-10 pr-4"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">
                    Primary Industry
                  </label>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="input"
                  >
                    <option value="Metal Fabrication & CNC Machining">Metal Fabrication & CNC Machining</option>
                    <option value="Construction & Structural Engineering">Construction & Structural Engineering</option>
                    <option value="Industrial Equipment & Wholesale">Industrial Equipment & Wholesale</option>
                    <option value="Custom Manufacturing & Packaging">Custom Manufacturing & Packaging</option>
                    <option value="B2B Services & Consulting">B2B Services & Consulting</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Quotation Defaults */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-white">2. Quotation Calculation Defaults</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Set baseline labor rates, material markup multipliers, and payment terms used when generating quotes.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div>
                  <label className="label">
                    Preferred Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="input"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="CAD">CAD ($)</option>
                    <option value="AUD">AUD ($)</option>
                    <option value="AED">AED (د.إ)</option>
                    <option value="PKR">PKR (₨)</option>
                  </select>
                </div>

                <div>
                  <label className="label">
                    Base Labor Rate (/ Hour)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={baseLaborRate}
                    onChange={(e) => setBaseLaborRate(e.target.value)}
                    className="input font-mono"
                  />
                </div>

                <div>
                  <label className="label">
                    Material Markup Multiplier
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    value={baseMaterialMarkup}
                    onChange={(e) => setBaseMaterialMarkup(e.target.value)}
                    className="input font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">1.20 = +20% markup over raw material cost</p>
                </div>
              </div>

              <div>
                <label className="label">
                  Default Payment & Quote Validity Terms
                </label>
                <input
                  type="text"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder="Net 30 days. Quote valid for 14 days."
                  className="input"
                />
              </div>
            </div>
          )}

          {/* STEP 3: Optional Integrations */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-semibold text-white">3. Connect AI & Communication Channels</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    All credentials are encrypted with Fernet symmetric encryption. You can also skip this and configure them anytime in Profile Settings.
                  </p>
                </div>
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-semibold self-start">
                  Optional Step
                </span>
              </div>

              {/* Gemini API Key */}
              <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-indigo-400 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" />
                    Google Gemini AI Engine Key
                  </span>
                  {userProfile?.has_gemini_key && (
                    <span className="text-[11px] text-emerald-400 font-semibold">Already Configured</span>
                  )}
                </div>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder={userProfile?.has_gemini_key ? '•••••••••••• (Leave blank to keep existing key)' : 'AIzaSy... (Leave blank to use server default if configured)'}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-brand-500 rounded-lg px-3.5 py-2 text-xs text-slate-100 outline-none font-mono"
                />
              </div>

              {/* Email: Google / Microsoft sign-in, or Gmail app password */}
              <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-brand-400 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    Email Inbox & Quote Sending
                  </span>
                  {(mailConnection?.connection || userProfile?.has_gmail_password) && (
                    <span className="text-[11px] text-emerald-400 font-semibold">Already Configured</span>
                  )}
                </div>

                {mailMessage && (
                  <div
                    role="status"
                    className={`p-2.5 rounded-lg text-xs border ${
                      mailMessage.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : 'bg-red-500/10 border-red-500/20 text-red-300'
                    }`}
                  >
                    {mailMessage.text}
                  </div>
                )}

                {mailConnection?.connection ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <p className="text-xs text-slate-300 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>
                        <span className="capitalize">{mailConnection.connection.provider}</span> mailbox{' '}
                        <span className="font-semibold text-white">{mailConnection.connection.email}</span> is connected.
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={handleMailDisconnect}
                      disabled={mailBusy}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50 cursor-pointer self-start"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <>
                    {mailConnection && (
                      <>
                        <p className="text-xs text-slate-400">
                          Sign in to read enquiries from your inbox and send quotes from it. No app password needed.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          {ssoProviders.map((provider) => (
                            <button
                              key={provider}
                              type="button"
                              onClick={() => handleMailConnect(provider)}
                              disabled={mailBusy || !ssoConfigured(provider)}
                              title={ssoConfigured(provider) ? undefined : 'Not set up on this server yet'}
                              className="flex-1 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer transition-colors"
                            >
                              {mailBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                              {provider === 'google' ? 'Sign in with Google' : 'Sign in with Microsoft'}
                            </button>
                          ))}
                        </div>
                        {!anySsoConfigured && (
                          <p className="text-[11px] text-amber-300/80">
                            Google / Microsoft sign-in isn't set up on this server yet. Use a Gmail app password below for now.
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <span className="h-px flex-1 bg-slate-800" />
                          or use a Gmail app password
                          <span className="h-px flex-1 bg-slate-800" />
                        </div>
                      </>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="email"
                        value={gmailEmail}
                        onChange={(e) => setGmailEmail(e.target.value)}
                        placeholder="sales@yourcompany.com"
                        className="w-full bg-slate-900 border border-slate-800 focus:border-brand-500 rounded-lg px-3.5 py-2 text-xs text-slate-100 outline-none"
                      />
                      <input
                        type="password"
                        value={gmailPassword}
                        onChange={(e) => setGmailPassword(e.target.value)}
                        placeholder={userProfile?.has_gmail_password ? '•••••••••••• (App Password saved)' : '16-character Google App Password'}
                        className="w-full bg-slate-900 border border-slate-800 focus:border-brand-500 rounded-lg px-3.5 py-2 text-xs text-slate-100 outline-none font-mono"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Twilio WhatsApp */}
              <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-emerald-400 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Twilio WhatsApp Business Responder
                  </span>
                  {userProfile?.has_twilio_sid && (
                    <span className="text-[11px] text-emerald-400 font-semibold">Already Configured</span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={twilioSid}
                    onChange={(e) => setTwilioSid(e.target.value)}
                    placeholder="Account SID (AC...)"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-brand-500 rounded-lg px-3.5 py-2 text-xs text-slate-100 outline-none font-mono"
                  />
                  <input
                    type="password"
                    value={twilioToken}
                    onChange={(e) => setTwilioToken(e.target.value)}
                    placeholder="Auth Token"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-brand-500 rounded-lg px-3.5 py-2 text-xs text-slate-100 outline-none font-mono"
                  />
                  <input
                    type="text"
                    value={twilioPhone}
                    onChange={(e) => setTwilioPhone(e.target.value)}
                    placeholder="whatsapp:+14155238886"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-brand-500 rounded-lg px-3.5 py-2 text-xs text-slate-100 outline-none font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Knowledge Base Kickstart */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white">4. Seed Your Knowledge Base</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Upload your pricing spreadsheet/PDF so the AI Quote Engine uses your exact rates, or load our starter fabrication catalog to test immediately.
                </p>
              </div>

              <FileUploader onUploadSuccess={uploadKbFile} />

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-lg bg-slate-950/70 border border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Don't have a pricing sheet handy?</h4>
                    <p className="text-xs text-slate-400">
                      Load a sample B2B metal fabrication & CNC pricing catalog to test the pipeline right away.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLoadSampleKb}
                  disabled={seedingSample}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shrink-0 cursor-pointer transition-colors"
                >
                  {seedingSample ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Load Starter Catalog
                </button>
              </div>

              {sampleLoadedMsg && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{sampleLoadedMsg}</span>
                </div>
              )}

              {kbFiles.length > 0 && (
                <div className="p-4 rounded-lg bg-slate-950/40 border border-slate-800/80">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                    Active Knowledge Base Files ({kbFiles.length})
                  </p>
                  <div className="space-y-1.5">
                    {kbFiles.map((f) => (
                      <div key={f.id} className="flex items-center justify-between text-xs py-1.5 px-3 rounded bg-slate-900 border border-slate-800/60">
                        <span className="text-slate-200 font-medium">{f.filename}</span>
                        <span className="text-[11px] uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Ready
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer Navigation Buttons */}
          <div className="mt-8 pt-5 border-t border-slate-800 flex items-center justify-between gap-4">
            {step > 1 && step < 4 ? (
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null)
                  setStep((prev) => Math.max(1, prev - 1))
                }}
                disabled={submitting}
                className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium flex items-center gap-2 cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            ) : (
              <div />
            )}

            {step < 4 ? (
              <div className="flex items-center gap-3">
                {step === 3 && (
                  <button
                    type="button"
                    onClick={handleSaveAndAdvanceToKb}
                    disabled={submitting}
                    className="px-4 py-2.5 rounded-lg border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white text-sm font-medium cursor-pointer transition-colors"
                  >
                    Skip Integrations for Now
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving Setup...
                    </>
                  ) : (
                    <>
                      {step === 3 ? 'Save & Continue' : 'Continue'}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="px-6 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors"
              >
                Launch Workspace Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Onboarding
