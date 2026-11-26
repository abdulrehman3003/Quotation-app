import React, { useEffect, useState } from 'react'
import { useWorkspaceStore, PLAN_OPTIONS, type AiModelsResponse, type AdminCompany, type AdminOverview, type PlanId, type SentNotice } from '../store/workspaceStore'
import { supabase } from '../lib/supabase'
import {
  Users,
  Settings,
  Database,
  Terminal,
  Shield,
  Loader2,
  Trash,
  Edit,
  Key,
  Mail,
  Phone,
  RefreshCw,
  Server,
  Activity,
  CheckCircle,
  AlertTriangle,
  Plus,
  X,
  Building2,
  Check,
  LayoutDashboard,
  UserCog,
  MessageSquare,
  FileText,
  Ban,
  CalendarClock,
  Megaphone,
  Send,
  LogOut
} from 'lucide-react'

export default function AdminPanel() {
  const {
    adminUsers,
    systemStatus,
    systemLogs,
    adminSettings,
    adminListUsers,
    adminCreateUser,
    adminUpdateUser,
    adminDeleteUser,
    adminCompanies,
    adminListCompanies,
    adminCreateCompany,
    adminRenameCompany,
    adminDeleteCompany,
    adminSetCompanyPlan,
    adminSetCompanyBilling,
    adminFetchOverview,
    adminFetchAccount,
    adminUpdateAccount,
    adminSendNotice,
    adminListNotices,
    adminResolveNotice,
    adminDeleteNotice,
    fetchSystemStatus,
    fetchSystemLogs,
    fetchAdminSettings,
    saveAdminSettings,
    fetchAiModels,
    saveAiModel,
    error
  } = useWorkspaceStore()

  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'companies' | 'messages' | 'keys' | 'database' | 'settings' | 'logs' | 'account'>('overview')
  // Messages tab
  const [sentNotices, setSentNotices] = useState<SentNotice[]>([])
  const [noticesAvailable, setNoticesAvailable] = useState(true)
  const [msgTarget, setMsgTarget] = useState('')            // company id, or 'all'
  const [msgKind, setMsgKind] = useState<'payment' | 'info' | 'warning'>('payment')
  const [msgTitle, setMsgTitle] = useState('')
  const [msgBody, setMsgBody] = useState('')
  const [msgAmount, setMsgAmount] = useState('')
  const [msgCurrency, setMsgCurrency] = useState('USD')
  const [msgDue, setMsgDue] = useState('')
  const [msgLink, setMsgLink] = useState(() => {
    try { return localStorage.getItem('axr_admin_payment_link') || '' } catch { return '' }
  })
  const [msgBanner, setMsgBanner] = useState(true)
  const [msgStatus, setMsgStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  // Billing fields in the company dialog
  const [billStatus, setBillStatus] = useState<'active' | 'suspended'>('active')
  const [billNextInvoice, setBillNextInvoice] = useState('')
  const [billSetupPaid, setBillSetupPaid] = useState(false)
  const [billNotes, setBillNotes] = useState('')
  const [billContact, setBillContact] = useState('')
  // Account tab
  const [accountEmail, setAccountEmail] = useState('')
  const [accNewEmail, setAccNewEmail] = useState('')
  const [accNewPassword, setAccNewPassword] = useState('')
  const [accConfirm, setAccConfirm] = useState('')
  const [accCurrent, setAccCurrent] = useState('')
  const [accMessage, setAccMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  
  // Settings tab state
  const [baseLaborRate, setBaseLaborRate] = useState('50.00')
  const [baseMaterialMarkup, setBaseMaterialMarkup] = useState('1.20')

  // AI model picker state
  const [aiModels, setAiModels] = useState<AiModelsResponse | null>(null)
  const [aiModel, setAiModel] = useState('')
  const [aiFallbacks, setAiFallbacks] = useState('')
  const [aiModelFilter, setAiModelFilter] = useState('')
  const [aiModelMessage, setAiModelMessage] = useState<string | null>(null)

  const loadAiModels = async (refresh = false) => {
    try {
      const data = await fetchAiModels(refresh)
      setAiModels(data)
      setAiModel(data.active_model)
      setAiFallbacks(data.fallback_models || '')
    } catch (err: any) {
      setAiModelMessage(err.message)
    }
  }

  // User creation state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createName, setCreateName] = useState('')
  const [createPhone, setCreatePhone] = useState('')
  const [createRole, setCreateRole] = useState('user')
  // 'new' creates a separate company for the user; otherwise it is an existing company id
  const [createCompany, setCreateCompany] = useState('new')
  const [createCompanyName, setCreateCompanyName] = useState('')
  const [createPlan, setCreatePlan] = useState<PlanId>('starter')
  const [newCompanyPlan, setNewCompanyPlan] = useState<PlanId>('starter')
  // Plan dialog for one company
  const [planCompany, setPlanCompany] = useState<AdminCompany | null>(null)
  const [planChoice, setPlanChoice] = useState<PlanId>('starter')
  const [planMaxUsers, setPlanMaxUsers] = useState('')
  const [planMaxQuotes, setPlanMaxQuotes] = useState('')

  // Companies tab state
  const [newCompanyName, setNewCompanyName] = useState('')
  const [renamingCompanyId, setRenamingCompanyId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // User edit state
  const [editingUser, setEditingUser] = useState<any | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editRole, setEditRole] = useState('user')
  const [editPassword, setEditPassword] = useState('')
  const [editGeminiKey, setEditGeminiKey] = useState('')
  const [editGmailEmail, setEditGmailEmail] = useState('')
  const [editGmailPassword, setEditGmailPassword] = useState('')
  const [editTwilioSid, setEditTwilioSid] = useState('')
  const [editTwilioToken, setEditTwilioToken] = useState('')
  const [editTwilioPhone, setEditTwilioPhone] = useState('')
  const [editCompanyId, setEditCompanyId] = useState('')
  
  useEffect(() => {
    setLoading(true)
    Promise.all([
      adminListUsers(),
      adminListCompanies().catch(() => {}),
      fetchSystemStatus(),
      fetchSystemLogs(),
      fetchAdminSettings().catch(() => {})
    ]).finally(() => setLoading(false))
  }, [adminListUsers, adminListCompanies, fetchSystemStatus, fetchSystemLogs, fetchAdminSettings])

  const loadOverview = () => adminFetchOverview().then(setOverview).catch((err) => setStatusMessage(err.message))

  const loadNotices = () =>
    adminListNotices()
      .then((r) => { setSentNotices(r.notifications); setNoticesAvailable(r.available) })
      .catch((err) => setMsgStatus({ ok: false, text: err.message }))

  // Fills the message form from a template, using the chosen company's plan and invoice date.
  const applyTemplate = (template: 'reminder' | 'overdue' | 'received' | 'notice', companyId = msgTarget) => {
    const c = adminCompanies.find((x) => x.id === companyId)
    const plan = c?.plan_label || 'AXRFLOWS'
    const price = c?.monthly_price != null ? String(c.monthly_price) : ''
    const due = c?.next_invoice_date ? String(c.next_invoice_date).slice(0, 10) : ''
    const dueText = due ? new Date(due + 'T00:00:00').toLocaleDateString([], { dateStyle: 'medium' }) : 'soon'
    if (template === 'reminder') {
      setMsgKind('payment'); setMsgTitle(`Invoice due ${dueText}`); setMsgAmount(price); setMsgDue(due); setMsgBanner(true)
      setMsgBody(`Your AXRFLOWS ${plan} plan invoice is due on ${dueText}. You can pay by card or bank transfer using the link below. Thank you!`)
    } else if (template === 'overdue') {
      setMsgKind('payment'); setMsgTitle('Payment overdue'); setMsgAmount(price); setMsgDue(due); setMsgBanner(true)
      setMsgBody(`We haven't received payment for your ${plan} plan invoice that was due on ${dueText}. Please pay using the link below to keep your workspace active. If you have already paid, just reply to let us know.`)
    } else if (template === 'received') {
      setMsgKind('info'); setMsgTitle('Payment received, thank you'); setMsgAmount(''); setMsgDue(''); setMsgBanner(false)
      setMsgBody(`We've received your payment for the ${plan} plan. Thank you for choosing AXRFLOWS.`)
    } else {
      setMsgKind('info'); setMsgTitle(''); setMsgAmount(''); setMsgDue(''); setMsgBanner(false); setMsgBody('')
    }
  }

  const messageCompany = (companyId: string, template?: 'reminder' | 'overdue') => {
    setMsgTarget(companyId)
    setMsgStatus(null)
    if (template) applyTemplate(template, companyId)
    setActiveTab('messages')
  }

  const sendMessage = async () => {
    setMsgStatus(null)
    if (!msgTarget) { setMsgStatus({ ok: false, text: 'Choose who to send it to.' }); return }
    if (msgTarget === 'all' && !window.confirm('Send this message to every active customer company?')) return
    try {
      const res = await adminSendNotice({
        ...(msgTarget === 'all' ? { all_companies: true } : { company_ids: [msgTarget] }),
        kind: msgKind,
        title: msgTitle,
        body: msgBody,
        amount: msgKind === 'payment' && msgAmount.trim() !== '' ? Number(msgAmount) : null,
        currency: msgKind === 'payment' ? msgCurrency : null,
        due_date: msgDue || null,
        payment_link: msgLink.trim() || null,
        show_banner: msgBanner,
      })
      try { if (msgLink.trim()) localStorage.setItem('axr_admin_payment_link', msgLink.trim()) } catch { /* ignore */ }
      setMsgStatus({ ok: true, text: `Sent to ${res.sent} compan${res.sent === 1 ? 'y' : 'ies'}.` })
      setMsgTitle(''); setMsgBody('')
      loadNotices()
    } catch (err: any) {
      setMsgStatus({ ok: false, text: err.message })
    }
  }

  useEffect(() => {
    if (activeTab === 'messages') loadNotices()
    if (activeTab === 'overview') loadOverview()
    if (activeTab === 'account' && !accountEmail) adminFetchAccount().then((a) => setAccountEmail(a.email)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'settings' && !aiModels) loadAiModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    if (adminSettings) {
      setBaseLaborRate(String(adminSettings.base_labor_rate))
      setBaseMaterialMarkup(String(adminSettings.base_material_markup))
    }
  }, [adminSettings])

  const handleAccessChange = async (user: any, approve: boolean) => {
    if (!approve && !window.confirm(`Revoke access for ${user.email}? They will be locked out until approved again.`)) return
    setStatusMessage(null)
    setLoading(true)
    try {
      await adminUpdateUser(user.id, { access_approved: approve })
      await adminListUsers()
      setStatusMessage(approve ? `${user.email} can now use the app.` : `Access revoked for ${user.email}.`)
    } catch (err: any) {
      setStatusMessage(`Failed to update access: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleEditClick = (user: any) => {
    setEditingUser(user)
    setEditName(user.name || '')
    setEditPhone(user.phone_number || '')
    setEditRole(user.role || 'user')
    setEditPassword('')
    setEditGeminiKey('')
    setEditGmailEmail('')
    setEditGmailPassword('')
    setEditTwilioSid('')
    setEditTwilioToken('')
    setEditTwilioPhone('')
    setEditCompanyId(user.company_id || '')
  }

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setStatusMessage(null)
    
    const updateData: any = {
      name: editName,
      phone_number: editPhone,
      role: editRole,
    }

    if (editPassword) updateData.password = editPassword
    if (editGeminiKey) updateData.gemini_key = editGeminiKey
    if (editGmailEmail) updateData.gmail_email = editGmailEmail
    if (editGmailPassword) updateData.gmail_password = editGmailPassword
    if (editTwilioSid) updateData.twilio_sid = editTwilioSid
    if (editTwilioToken) updateData.twilio_token = editTwilioToken
    if (editTwilioPhone) updateData.twilio_phone = editTwilioPhone
    if (editCompanyId && editCompanyId !== (editingUser.company_id || '')) {
      const target = adminCompanies.find(c => c.id === editCompanyId)
      const ok = window.confirm(
        `Move ${editingUser.email} to "${target?.name || 'the selected company'}"?\n\n` +
        `They will see that company's leads, quotes and knowledge base, and share its mailbox and API keys. ` +
        `If they were the only member of their current company, their records move with them.`
      )
      if (!ok) return
      updateData.company_id = editCompanyId
    }

    setLoading(true)
    try {
      await adminUpdateUser(editingUser.id, updateData)
      setEditingUser(null)
      setStatusMessage('User profile and credentials updated successfully.')
    } catch (err: any) {
      setStatusMessage(err.message || 'Failed to update user.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = async (userId: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this user account?")) return
    setLoading(true)
    setStatusMessage(null)
    try {
      await adminDeleteUser(userId)
      setStatusMessage('User account deleted successfully.')
    } catch (err: any) {
      setStatusMessage(err.message || 'Failed to delete user.')
    } finally {
      setLoading(false)
    }
  }
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createEmail || !createPassword) return
    setLoading(true)
    setStatusMessage(null)
    try {
      await adminCreateUser({
        email: createEmail,
        password: createPassword,
        name: createName || undefined,
        phone_number: createPhone || undefined,
        role: createRole,
        ...(createCompany === 'new'
          ? { new_company_name: createCompanyName.trim() || undefined, plan: createPlan }
          : { company_id: createCompany })
      })
      setCreateEmail('')
      setCreatePassword('')
      setCreateName('')
      setCreatePhone('')
      setCreateRole('user')
      setCreateCompany('new')
      setCreateCompanyName('')
      setCreatePlan('starter')
      setShowCreateModal(false)
      setStatusMessage('New user account created successfully.')
    } catch (err: any) {
      setStatusMessage(err.message || 'Failed to create user.')
    } finally {
      setLoading(false)
    }
  }

  const openPlanDialog = (company: AdminCompany) => {
    setPlanCompany(company)
    setPlanChoice(company.plan || 'starter')
    setPlanMaxUsers(company.custom_max_users != null ? String(company.custom_max_users) : '')
    setPlanMaxQuotes(company.custom_max_quotes_per_month != null ? String(company.custom_max_quotes_per_month) : '')
    setBillStatus(company.status || 'active')
    setBillNextInvoice(company.next_invoice_date ? String(company.next_invoice_date).slice(0, 10) : '')
    setBillSetupPaid(!!company.setup_fee_paid)
    setBillNotes(company.billing_notes || '')
    setBillContact(company.contact_email || '')
  }

  const openCompanyById = (id: string) => {
    const company = adminCompanies.find((c) => c.id === id)
    if (company) openPlanDialog(company)
  }

  const savePlan = async () => {
    if (!planCompany) return
    const toLimit = (v: string) => (v.trim() === '' ? null : Number(v))
    setLoading(true)
    setStatusMessage(null)
    try {
      if (billStatus === 'suspended' && planCompany.status !== 'suspended' &&
          !window.confirm(`Suspend ${planCompany.name}? Its users are locked out and its mailbox and WhatsApp stop being processed until you reactivate it.`)) {
        return
      }
      const res = await adminSetCompanyPlan(planCompany.id, planChoice, toLimit(planMaxUsers), toLimit(planMaxQuotes))
      await adminSetCompanyBilling(planCompany.id, {
        status: billStatus,
        next_invoice_date: billNextInvoice || null,
        setup_fee_paid: billSetupPaid,
        billing_notes: billNotes || null,
        contact_email: billContact || null,
      })
      const label = PLAN_OPTIONS.find(p => p.id === planChoice)?.label
      setStatusMessage(
        res.over_user_limit
          ? `${planCompany.name} saved (${label}). It has ${res.users} users, above the new limit of ${res.max_users}: nobody was removed, but no one else can join.`
          : `${planCompany.name} saved (${label}${billStatus === 'suspended' ? ', suspended' : ''}).`
      )
      setPlanCompany(null)
      if (activeTab === 'overview') loadOverview()
    } catch (err: any) {
      setStatusMessage(err.message)
    } finally {
      setLoading(false)
    }
  }

  const runCompanyAction = async (action: () => Promise<unknown>, success: string) => {
    setLoading(true)
    setStatusMessage(null)
    try {
      await action()
      setStatusMessage(success)
      return true
    } catch (err: any) {
      setStatusMessage(err.message || 'Company action failed.')
      return false
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setLoading(true)
    if (activeTab === 'overview') loadOverview()
    await Promise.all([
      adminListUsers(),
      adminListCompanies().catch(() => {}),
      fetchSystemStatus(),
      fetchSystemLogs()
    ])
    setLoading(false)
  }

  const pendingApprovals = adminUsers.filter((u: any) => u.access_approved === false).length
  const navItems: { key: typeof activeTab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'companies', label: 'Companies', icon: Building2 },
    { key: 'users', label: 'Users', icon: Users, count: pendingApprovals },
    { key: 'messages', label: 'Messages', icon: Megaphone },
    { key: 'settings', label: 'AI & Settings', icon: Settings },
    { key: 'keys', label: 'API Keys', icon: Key },
    { key: 'database', label: 'Database', icon: Database },
    { key: 'logs', label: 'System Logs', icon: Terminal },
    { key: 'account', label: 'My Account', icon: UserCog },
  ]

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-950 text-slate-100">
      {/* Left sidebar navigation */}
      <aside className="w-60 h-full shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="h-16 px-4 flex items-center gap-2.5 border-b border-slate-800 shrink-0">
          <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold">A</div>
          <span className="text-sm font-semibold tracking-wide text-slate-50">AXRFLOWS Admin</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {navItems.map(item => {
            const Icon = item.icon
            const active = activeTab === item.key
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`relative w-full flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-800 text-slate-50 font-medium before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-indigo-400'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left truncate">{item.label}</span>
                {!!item.count && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-medium flex items-center justify-center tabular-nums">{item.count}</span>
                )}
              </button>
            )
          })}
        </nav>
        <div className="p-3 border-t border-slate-800 shrink-0">
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

    <div className="flex-1 p-8 overflow-y-auto bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="border-b border-slate-800 pb-6 mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white tracking-tight flex items-center gap-2">
              <Shield className="h-8 w-8 text-indigo-400" />
              AXRFLOWS Admin
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Your customers, their plans and billing, users, AI settings and system health.
            </p>
          </div>

          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Sync Status
          </button>
        </div>

        {/* System Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="p-5 rounded-lg bg-slate-900/40 border border-slate-800/80">
            <div className="flex justify-between items-start text-slate-500">
              <span className="text-xs uppercase font-semibold tracking-wide">Backend Server</span>
              <Server className="h-5 w-5 text-indigo-400" />
            </div>
            <p className="text-2xl font-semibold mt-2 text-white">Active</p>
            <span className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
              API reachable
            </span>
          </div>

          <div className="p-5 rounded-lg bg-slate-900/40 border border-slate-800/80">
            <div className="flex justify-between items-start text-slate-500">
              <span className="text-xs uppercase font-semibold tracking-wide">Supabase Status</span>
              <Database className="h-5 w-5 text-brand-400" />
            </div>
            <p className="text-2xl font-semibold mt-2 text-white">
              {systemStatus?.database_status === 'healthy' ? 'Connected' : 'Offline'}
            </p>
            <span className={`text-[11px] flex items-center gap-1 mt-1 ${
              systemStatus?.database_status === 'healthy' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {systemStatus?.database_status === 'healthy' ? 'RLS Policies Enabled' : 'Check API Settings'}
            </span>
          </div>

          <div className="p-5 rounded-lg bg-slate-900/40 border border-slate-800/80">
            <div className="flex justify-between items-start text-slate-500">
              <span className="text-xs uppercase font-semibold tracking-wide">Registered Tenants</span>
              <Users className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="text-2xl font-semibold mt-2 text-white">{adminUsers.length}</p>
            <span className="text-[11px] text-slate-500 mt-1">Active Client Profiles</span>
          </div>

          <div className="p-5 rounded-lg bg-slate-900/40 border border-slate-800/80">
            <div className="flex justify-between items-start text-slate-500">
              <span className="text-xs uppercase font-semibold tracking-wide">Diagnostic Logs</span>
              <Terminal className="h-5 w-5 text-amber-400" />
            </div>
            <p className="text-2xl font-semibold mt-2 text-white">{systemLogs.length}</p>
            <span className="text-[11px] text-slate-500 mt-1">Logged Incidents</span>
          </div>
        </div>

        {statusMessage && (
          <div className="p-4 mb-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm">
            {statusMessage}
          </div>
        )}


        {/* Tab Content Panel */}
        <div className="min-h-[400px]">
          {/* TAB 1: User Management */}
          {/* TAB: Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {!overview ? (
                <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading overview</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-5 rounded-lg bg-slate-900/40 border border-slate-800/80">
                      <p className="text-xs uppercase font-semibold tracking-wide text-slate-500">Active customers</p>
                      <p className="text-2xl font-semibold mt-2 text-white tabular-nums">{overview.companies.active}</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {PLAN_OPTIONS.map(p => `${overview.companies.by_plan[p.id] || 0} ${p.label}`).join(' · ')}
                        {overview.companies.suspended ? ` · ${overview.companies.suspended} suspended` : ''}
                      </p>
                    </div>
                    <div className="p-5 rounded-lg bg-slate-900/40 border border-slate-800/80">
                      <p className="text-xs uppercase font-semibold tracking-wide text-slate-500">Est. monthly revenue</p>
                      <p className="text-2xl font-semibold mt-2 text-emerald-400 tabular-nums">${overview.estimated_mrr.toLocaleString()}</p>
                      <p className="text-[11px] text-slate-500 mt-1">At list prices, active customers only</p>
                    </div>
                    <div className="p-5 rounded-lg bg-slate-900/40 border border-slate-800/80">
                      <p className="text-xs uppercase font-semibold tracking-wide text-slate-500">Customer users</p>
                      <p className="text-2xl font-semibold mt-2 text-white tabular-nums">{overview.users.total}</p>
                      <button onClick={() => setActiveTab('users')} className={`text-[11px] mt-1 cursor-pointer ${overview.users.pending_approval ? 'text-amber-400 hover:text-amber-300' : 'text-slate-500'}`}>
                        {overview.users.pending_approval} waiting for approval
                      </button>
                    </div>
                    <div className="p-5 rounded-lg bg-slate-900/40 border border-slate-800/80">
                      <p className="text-xs uppercase font-semibold tracking-wide text-slate-500">AI quotes this month</p>
                      <p className="text-2xl font-semibold mt-2 text-white tabular-nums">{overview.quotes_this_month.drafted}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{overview.quotes_this_month.sent} sent · {overview.quotes_this_month.won} won</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {([
                      { title: 'Invoices overdue', tone: 'text-red-400', empty: 'Nothing overdue.', remind: 'overdue' as const,
                        rows: overview.invoices_overdue.map(i => ({ id: i.id, name: i.name, detail: `${i.plan} · $${i.amount ?? '?'} · due ${i.date}` })) },
                      { title: 'Invoices due in the next 7 days', tone: 'text-amber-400', empty: 'No invoices due this week.', remind: 'reminder' as const,
                        rows: overview.invoices_due.map(i => ({ id: i.id, name: i.name, detail: `${i.plan} · $${i.amount ?? '?'} · ${i.date}` })) },
                      { title: 'Setup fee not marked paid', tone: 'text-amber-400', empty: 'All setup fees are paid.',
                        rows: overview.setup_fees_unpaid.map(i => ({ id: i.id, name: i.name, detail: 'Mark it paid in Manage company' })) },
                      { title: 'At or near their plan limit (upgrade chance)', tone: 'text-indigo-300', empty: 'No one is close to their limits.',
                        rows: overview.near_limit.map(i => ({ id: i.id, name: i.name, detail: `${i.plan} · ${i.reasons.join(', ')}` })) },
                      { title: 'Not fully set up yet', tone: 'text-slate-300', empty: 'Every customer has a price list and mailbox.',
                        rows: overview.not_set_up.map(i => ({ id: i.id, name: i.name, detail: `Missing: ${i.missing.join(', ')}` })) },
                    ]).map(card => (
                      <div key={card.title} className="rounded-lg bg-slate-900/40 border border-slate-800/80">
                        <h3 className={`px-5 py-3 border-b border-slate-800 text-sm font-semibold ${card.tone}`}>
                          {card.title} {card.rows.length > 0 && <span className="text-slate-500 font-normal">({card.rows.length})</span>}
                        </h3>
                        {card.rows.length === 0 ? (
                          <p className="px-5 py-4 text-xs text-slate-500">{card.empty}</p>
                        ) : (
                          <ul className="divide-y divide-slate-800/60">
                            {card.rows.map(r => (
                              <li key={r.id} className="flex items-center">
                                <button onClick={() => openCompanyById(r.id)} className="flex-1 text-left px-5 py-2.5 hover:bg-slate-900/60 cursor-pointer">
                                  <span className="block text-sm text-white">{r.name}</span>
                                  <span className="block text-xs text-slate-500">{r.detail}</span>
                                </button>
                                {'remind' in card && card.remind && (
                                  <button
                                    onClick={() => messageCompany(r.id, card.remind)}
                                    className="mr-4 px-2.5 py-1 rounded text-xs font-semibold bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 cursor-pointer flex items-center gap-1"
                                  >
                                    <Send className="h-3 w-3" /> Send reminder
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-900/20 p-4 border border-slate-800 rounded-lg">
                <div>
                  <h3 className="font-semibold text-white">User Base Directory</h3>
                  <p className="text-xs text-slate-400">
                    Total registered client tenants: {adminUsers.length}
                    {adminUsers.some((u: any) => u.access_approved === false) && (
                      <span className="ml-2 text-amber-400">
                        · {adminUsers.filter((u: any) => u.access_approved === false).length} waiting for approval
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Add New User
                </button>
              </div>

              <div className="rounded-lg bg-slate-900/40 border border-slate-800/80 overflow-hidden">
                <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 text-xs font-semibold uppercase tracking-wide">
                    <th className="px-6 py-4">Tenant Email</th>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Company</th>
                    <th className="px-6 py-4">Phone</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {adminUsers.map(user => (
                    <tr key={user.id} className="hover:bg-slate-900/20">
                      <td className="px-6 py-4 font-semibold text-white">{user.email}</td>
                      <td className="px-6 py-4">{user.name || <span className="text-slate-600 italic">None</span>}</td>
                      <td className="px-6 py-4">{user.company_name || <span className="text-slate-600 italic">None</span>}</td>
                      <td className="px-6 py-4 font-mono text-xs">{user.phone_number || <span className="text-slate-600 italic">None</span>}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${
                          user.role === 'admin' 
                            ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' 
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {user.role.toUpperCase()}
                        </span>
                        {user.access_approved === false && (
                          <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full font-semibold border bg-amber-500/10 text-amber-400 border-amber-500/20">
                            PENDING
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                        {user.role !== 'admin' && (
                          <button
                            onClick={() => handleAccessChange(user, user.access_approved === false)}
                            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                              user.access_approved === false
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800'
                            }`}
                          >
                            {user.access_approved === false ? 'Approve' : 'Revoke'}
                          </button>
                        )}
                        <button
                          onClick={() => handleEditClick(user)}
                          className="p-1.5 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300 rounded transition-colors cursor-pointer"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(user.id)}
                          className="p-1.5 hover:bg-slate-800 text-red-400 hover:text-red-300 rounded transition-colors cursor-pointer"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {/* Companies: each one is an isolated tenant */}
          {activeTab === 'companies' && (
            <div className="space-y-4 max-w-4xl">
              <div className="bg-slate-900/20 p-4 border border-slate-800 rounded-lg">
                <h3 className="font-semibold text-white">Companies</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Users in the same company share leads, quotes, the knowledge base, the mailbox and API keys.
                  Different companies are fully separated, and two companies can't use the same mailbox or WhatsApp number.
                </p>
                <form
                  className="flex gap-2 mt-4"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!newCompanyName.trim()) return
                    const ok = await runCompanyAction(() => adminCreateCompany(newCompanyName.trim(), newCompanyPlan), `Company "${newCompanyName.trim()}" created.`)
                    if (ok) { setNewCompanyName(''); setNewCompanyPlan('starter') }
                  }}
                >
                  <input
                    type="text"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="New company name"
                    className="input flex-1"
                  />
                  <select
                    value={newCompanyPlan}
                    onChange={(e) => setNewCompanyPlan(e.target.value as PlanId)}
                    className="input w-36"
                    aria-label="Plan"
                  >
                    {PLAN_OPTIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <button
                    type="submit"
                    disabled={loading || !newCompanyName.trim()}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Add Company
                  </button>
                </form>
              </div>

              <div className="rounded-lg bg-slate-900/40 border border-slate-800/80 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 text-xs font-semibold uppercase tracking-wide">
                      <th className="px-6 py-4">Company</th>
                      <th className="px-6 py-4">Plan</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Users</th>
                      <th className="px-6 py-4">AI quotes this month</th>
                      <th className="px-6 py-4">Next invoice</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {adminCompanies.length === 0 && (
                      <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500 italic">No companies yet.</td></tr>
                    )}
                    {adminCompanies.map(company => (
                      <tr key={company.id} className="hover:bg-slate-900/20">
                        <td className="px-6 py-4 font-semibold text-white">
                          {renamingCompanyId === company.id ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={async (e) => {
                                if (e.key === 'Escape') setRenamingCompanyId(null)
                                if (e.key === 'Enter' && renameValue.trim()) {
                                  const ok = await runCompanyAction(() => adminRenameCompany(company.id, renameValue.trim()), 'Company renamed.')
                                  if (ok) setRenamingCompanyId(null)
                                }
                              }}
                              className="input"
                            />
                          ) : (
                            <>
                              <span>{company.name}</span>
                              <span className="flex items-center gap-2 mt-1 text-[11px] font-normal text-slate-500">
                                <span title={company.mailbox_connected ? 'Mailbox connected' : 'No mailbox'} className={company.mailbox_connected ? 'text-emerald-400' : ''}><Mail className="h-3.5 w-3.5" /></span>
                                <span title={company.whatsapp_connected ? 'WhatsApp connected' : 'No WhatsApp'} className={company.whatsapp_connected ? 'text-emerald-400' : ''}><MessageSquare className="h-3.5 w-3.5" /></span>
                                <span title="Knowledge-base files" className="flex items-center gap-0.5"><FileText className="h-3.5 w-3.5" />{company.kb_files ?? 0}</span>
                                <span>{company.quotes_total ?? 0} quotes</span>
                                {company.last_activity && <span>· active {new Date(company.last_activity).toLocaleDateString()}</span>}
                              </span>
                              {company.contact_email && <span className="block text-[11px] font-normal text-slate-500">{company.contact_email}</span>}
                            </>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => openPlanDialog(company)}
                            title="Change plan"
                            className="text-[11px] px-2 py-0.5 rounded-full font-semibold border bg-indigo-500/10 text-indigo-300 border-indigo-500/20 hover:border-indigo-400 cursor-pointer"
                          >
                            {(company.plan_label || 'Starter').toUpperCase()}{company.custom_limits ? ' · CUSTOM' : ''}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          {company.status === 'suspended' ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold border bg-red-500/10 text-red-400 border-red-500/20 inline-flex items-center gap-1"><Ban className="h-3 w-3" />SUSPENDED</span>
                          ) : (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">ACTIVE</span>
                          )}
                          {!company.setup_fee_paid && <span className="block text-[11px] text-amber-400 mt-1">Setup fee unpaid</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={company.max_users != null && company.member_count >= company.max_users ? 'text-amber-400 font-semibold' : ''}>
                            {company.member_count}{company.max_users != null ? ` / ${company.max_users}` : ''}
                          </span>
                          {company.member_count > 0 && (
                            <span className="text-xs text-slate-500 ml-2">
                              {adminUsers.filter(u => u.company_id === company.id).map(u => u.email).join(', ')}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 tabular-nums">
                          <span className={company.max_quotes_per_month != null && (company.quotes_this_month ?? 0) >= company.max_quotes_per_month ? 'text-amber-400 font-semibold' : ''}>
                            {company.quotes_this_month ?? 0}{company.max_quotes_per_month != null ? ` / ${company.max_quotes_per_month}` : ''}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs whitespace-nowrap">
                          {company.next_invoice_date ? (
                            <span className={new Date(company.next_invoice_date) < new Date(new Date().toDateString()) ? 'text-red-400 font-semibold' : 'text-slate-300'}>
                              <CalendarClock className="inline h-3.5 w-3.5 mr-1" />{String(company.next_invoice_date).slice(0, 10)}
                            </span>
                          ) : <span className="text-slate-600 italic">Not set</span>}
                          {company.monthly_price != null && <span className="block text-[11px] text-slate-500">${company.monthly_price}/mo list</span>}
                        </td>
                        <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                          <button
                            title="Send this company a message"
                            onClick={() => messageCompany(company.id)}
                            className="p-1.5 hover:bg-slate-800 text-indigo-300 rounded transition-colors cursor-pointer"
                          >
                            <Megaphone className="h-4 w-4" />
                          </button>
                          <button
                            title="Manage plan, billing and status"
                            onClick={() => openPlanDialog(company)}
                            className="px-2.5 py-1 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                          >
                            Manage
                          </button>
                          {renamingCompanyId === company.id ? (
                            <button
                              title="Save name"
                              onClick={async () => {
                                if (!renameValue.trim()) return
                                const ok = await runCompanyAction(() => adminRenameCompany(company.id, renameValue.trim()), 'Company renamed.')
                                if (ok) setRenamingCompanyId(null)
                              }}
                              className="p-1.5 hover:bg-slate-800 text-emerald-400 rounded transition-colors cursor-pointer"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              title="Rename"
                              onClick={() => { setRenamingCompanyId(company.id); setRenameValue(company.name) }}
                              className="p-1.5 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300 rounded transition-colors cursor-pointer"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            title={company.member_count > 0 ? 'Move or delete its users first' : 'Delete company'}
                            disabled={company.member_count > 0}
                            onClick={async () => {
                              if (!window.confirm(`Delete the empty company "${company.name}"?`)) return
                              await runCompanyAction(() => adminDeleteCompany(company.id), 'Company deleted.')
                            }}
                            className="p-1.5 hover:bg-slate-800 text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors cursor-pointer"
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: Encrypted API Keys Setup */}
          {/* TAB: Messages */}
          {activeTab === 'messages' && (
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              <div className="xl:col-span-2 p-6 rounded-lg bg-slate-900/40 border border-slate-800/80 space-y-4 h-fit">
                <div>
                  <h3 className="font-semibold text-white text-base flex items-center gap-2"><Megaphone className="h-5 w-5 text-indigo-400" />New message</h3>
                  <p className="text-xs text-slate-400 mt-1">Shows in the customer's notification bell. Pinned messages also appear as a banner until you resolve them.</p>
                </div>
                {!noticesAvailable && (
                  <p className="text-xs text-amber-400">Run database/migration_v13_company_notifications.sql to enable messages.</p>
                )}
                <div>
                  <label className="label">Send to</label>
                  <select value={msgTarget} onChange={(e) => setMsgTarget(e.target.value)} className="input">
                    <option value="">Choose a company…</option>
                    <option value="all">All active companies</option>
                    {adminCompanies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.status === 'suspended' ? ' (suspended)' : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="label">Template</p>
                  <div className="flex flex-wrap gap-2">
                    {([['reminder', 'Payment reminder'], ['overdue', 'Payment overdue'], ['received', 'Payment received'], ['notice', 'Blank notice']] as const).map(([key, label]) => (
                      <button key={key} type="button" onClick={() => applyTemplate(key)} className="px-2.5 py-1 rounded-full text-xs border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white cursor-pointer">
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label">Type</label>
                    <select value={msgKind} onChange={(e) => setMsgKind(e.target.value as 'payment' | 'info' | 'warning')} className="input">
                      <option value="payment">Payment</option>
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="label">Title</label>
                    <input value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} maxLength={200} className="input" />
                  </div>
                </div>
                <div>
                  <label className="label">Message</label>
                  <textarea rows={4} value={msgBody} onChange={(e) => setMsgBody(e.target.value)} maxLength={4000} className="input resize-none" />
                </div>
                {msgKind === 'payment' && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label">Amount</label>
                      <input type="number" min={0} step="0.01" value={msgAmount} onChange={(e) => setMsgAmount(e.target.value)} className="input" />
                    </div>
                    <div>
                      <label className="label">Currency</label>
                      <select value={msgCurrency} onChange={(e) => setMsgCurrency(e.target.value)} className="input">
                        {['USD', 'AED', 'SAR', 'EUR', 'GBP', 'PKR'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Due date</label>
                      <input type="date" value={msgDue} onChange={(e) => setMsgDue(e.target.value)} className="input" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="label">Payment link (optional)</label>
                  <input value={msgLink} onChange={(e) => setMsgLink(e.target.value)} placeholder="https://link.payoneer.com/…" className="input font-mono text-xs" />
                  <p className="text-[11px] text-slate-500 mt-1">Shown as a "Pay now" button. Remembered for next time on this browser.</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={msgBanner} onChange={(e) => setMsgBanner(e.target.checked)} />
                  Pin as a banner until resolved
                </label>
                {msgStatus && <p className={`text-xs ${msgStatus.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msgStatus.text}</p>}
                <button
                  onClick={sendMessage}
                  disabled={!msgTarget || !msgTitle.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" /> Send message
                </button>
              </div>

              <div className="xl:col-span-3 rounded-lg bg-slate-900/40 border border-slate-800/80 overflow-hidden h-fit">
                <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Sent messages</h3>
                  <button onClick={loadNotices} className="text-xs text-slate-400 hover:text-white cursor-pointer">Refresh</button>
                </div>
                {sentNotices.length === 0 ? (
                  <p className="px-5 py-8 text-center text-xs text-slate-500">No messages sent yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-800/60">
                    {sentNotices.map(n => (
                      <li key={n.id} className="px-5 py-3 flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-slate-500">
                            {new Date(n.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {n.company_name || 'Company'} · {n.kind}
                            {n.show_banner ? ' · banner' : ''}
                          </p>
                          <p className="text-sm font-semibold text-white mt-0.5">{n.title}</p>
                          {(n.amount != null || n.due_date) && (
                            <p className="text-xs text-amber-200">
                              {n.amount != null ? `${n.currency || 'USD'} ${Number(n.amount).toFixed(2)}` : ''}{n.amount != null && n.due_date ? ' · ' : ''}{n.due_date ? `due ${n.due_date}` : ''}
                            </p>
                          )}
                          {n.body && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>}
                          <p className="text-[11px] text-slate-500 mt-1">
                            Read by {n.read_count} of {n.member_count} user{n.member_count === 1 ? '' : 's'} ·{' '}
                            {n.resolved_at ? <span className="text-emerald-400">Resolved</span> : <span className="text-amber-400">Open</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!n.resolved_at && (
                            <button
                              title={n.kind === 'payment' ? 'Mark paid: removes it from their banner' : 'Resolve'}
                              onClick={async () => { await adminResolveNotice(n.id); loadNotices() }}
                              className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-600/80 hover:bg-emerald-500 text-white cursor-pointer"
                            >
                              {n.kind === 'payment' ? 'Mark paid' : 'Resolve'}
                            </button>
                          )}
                          <button
                            title="Delete message"
                            onClick={async () => { if (window.confirm('Delete this message for the customer too?')) { await adminDeleteNotice(n.id); loadNotices() } }}
                            className="p-1.5 hover:bg-slate-800 text-red-400 rounded cursor-pointer"
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {activeTab === 'keys' && (
            <div className="grid grid-cols-1 gap-6 max-w-4xl">
              {adminUsers.map(user => (
                <div key={user.id} className="p-6 rounded-lg bg-slate-900/40 border border-slate-800/80">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
                    <div>
                      <h3 className="font-semibold text-white text-base">{user.name || 'Unnamed Client'}</h3>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                    <button
                      onClick={() => handleEditClick(user)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Key className="h-3.5 w-3.5" />
                      Configure Keys
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <Key className={`h-4 w-4 ${user.has_gemini_key ? 'text-emerald-400' : 'text-slate-600'}`} />
                      <span>AIML API Key: <strong>{user.has_gemini_key ? 'Encrypted' : 'Missing'}</strong></span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Mail className={`h-4 w-4 ${user.has_gmail_email ? 'text-emerald-400' : 'text-slate-600'}`} />
                      <span>Gmail SMTP: <strong>{user.has_gmail_email ? 'Encrypted' : 'Missing'}</strong></span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Phone className={`h-4 w-4 ${user.has_twilio_sid ? 'text-emerald-400' : 'text-slate-600'}`} />
                      <span>Twilio Whatsapp: <strong>{user.has_twilio_sid ? 'Encrypted' : 'Missing'}</strong></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: Supabase Database Stats */}
          {activeTab === 'database' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl">
              <div className="p-6 rounded-lg bg-slate-900/40 border border-slate-800/80">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <Database className="h-5 w-5 text-indigo-400" />
                  Table Row Statistics
                </h3>
                <div className="space-y-3 text-sm">
                  {systemStatus?.table_stats ? (
                    Object.entries(systemStatus.table_stats).map(([table, count]) => (
                      <div key={table} className="flex justify-between items-center py-1 border-b border-slate-800/40 font-mono">
                        <span className="text-slate-400">{table.replace('_count', '')}</span>
                        <span className="text-white font-semibold">{count as number}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500 italic">No table data loaded.</p>
                  )}
                </div>
              </div>

              <div className="p-6 rounded-lg bg-slate-900/40 border border-slate-800/80">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <Settings className="h-5 w-5 text-emerald-400" />
                  Global Quote Defaults
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Used when a customer hasn't set their own. Change them in System Settings.
                </p>
                <div className="space-y-3 text-sm font-mono">
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Base labour rate / hour</span>
                    <span className="text-white font-semibold">{adminSettings ? adminSettings.base_labor_rate : '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Material markup multiplier</span>
                    <span className="text-white font-semibold">{adminSettings ? `${adminSettings.base_material_markup}x` : '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: System Settings */}
          {activeTab === 'settings' && (
            <div className="space-y-6 animate-in fade-in">
              {/* AI model picker */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-6">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h3 className="font-semibold text-white text-base flex items-center gap-2">
                    <Settings className="h-5 w-5 text-indigo-400" />
                    AI Model
                  </h3>
                  <button
                    onClick={() => loadAiModels(true)}
                    className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Refresh list
                  </button>
                </div>
                <p className="text-xs text-slate-400 mb-6">
                  The model that prices requests and drafts replies for every workspace, served through AIML API.
                  Default: <span className="font-mono text-slate-300">{aiModels?.default_model || 'openai/gpt-4o-mini'}</span>.
                  Larger models cost more per quote; check prices at aimlapi.com before switching.
                </p>

                {!aiModels ? (
                  <p className="text-xs text-slate-500">Loading models…</p>
                ) : (
                  <div className="space-y-5">
                    {!aiModels.live && (
                      <p className="text-xs text-amber-400">
                        Could not reach AIML API for the full list. Showing the recommended models only.
                      </p>
                    )}

                    <div>
                      <label className="label">Recommended</label>
                      <div className="flex flex-wrap gap-2">
                        {aiModels.recommended.map((id) => (
                          <button
                            key={id}
                            onClick={() => setAiModel(id)}
                            className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-colors cursor-pointer ${
                              aiModel === id
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                            }`}
                          >
                            {id}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="label">All chat models ({aiModels.models.length})</label>
                        <input
                          type="text"
                          value={aiModelFilter}
                          onChange={(e) => setAiModelFilter(e.target.value)}
                          placeholder="Filter, e.g. claude, gemini, gpt-4.1"
                          className="input mb-2"
                        />
                        <select
                          value={aiModel}
                          onChange={(e) => setAiModel(e.target.value)}
                          size={8}
                          className="input font-mono text-xs"
                        >
                          {aiModels.models
                            .filter((m) => {
                              const q = aiModelFilter.trim().toLowerCase()
                              return !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.id === aiModel
                            })
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.id}{m.name && m.name !== m.id ? ` · ${m.name}` : ''}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="label">Selected model</label>
                          <input
                            type="text"
                            value={aiModel}
                            onChange={(e) => setAiModel(e.target.value)}
                            className="input font-mono"
                          />
                        </div>
                        <div>
                          <label className="label">Fallback models (comma-separated, optional)</label>
                          <input
                            type="text"
                            value={aiFallbacks}
                            onChange={(e) => setAiFallbacks(e.target.value)}
                            placeholder="openai/gpt-4.1-mini"
                            className="input font-mono"
                          />
                          <p className="text-[11px] text-slate-500 mt-1">Tried in order when the selected model is busy or unavailable.</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <button
                        onClick={async () => {
                          setAiModelMessage(null)
                          try {
                            const saved = await saveAiModel(aiModel, aiFallbacks)
                            setAiModels({ ...aiModels, active_model: saved.active_model, fallback_models: saved.fallback_models })
                            setAiModelMessage(`Now using ${saved.active_model}.`)
                          } catch (err: any) {
                            setAiModelMessage(err.message)
                          }
                        }}
                        disabled={!aiModel.trim() || (aiModel === aiModels.active_model && aiFallbacks === (aiModels.fallback_models || ''))}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Save AI Model
                      </button>
                      <span className="text-xs text-slate-400">
                        Active: <span className="font-mono text-slate-200">{aiModels.active_model}</span>
                      </span>
                    </div>
                    {aiModelMessage && <p className="text-xs text-slate-300">{aiModelMessage}</p>}
                  </div>
                )}
              </div>

              {/* Global Quotation Parameters Card */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-6">
                <h3 className="font-semibold text-white text-base flex items-center gap-2 mb-2">
                  <Settings className="h-5 w-5 text-indigo-400" />
                  Global Quotation Parameters
                </h3>
                <p className="text-xs text-slate-400 mb-6">
                  Set the default values that will be used by the AI engine globally for all quotation calculations.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="label">
                      Base Labor Rate ($ / Hour)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={baseLaborRate}
                      onChange={(e) => setBaseLaborRate(e.target.value)}
                      className="input font-mono"
                    />
                  </div>

                  <div>
                    <label className="label">
                      Base Material Markup Multiplier
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={baseMaterialMarkup}
                      onChange={(e) => setBaseMaterialMarkup(e.target.value)}
                      className="input font-mono"
                    />
                  </div>
                </div>

                <button
                  onClick={async () => {
                    setLoading(true)
                    setStatusMessage(null)
                    try {
                      await saveAdminSettings({
                        base_labor_rate: Number(baseLaborRate),
                        base_material_markup: Number(baseMaterialMarkup)
                      })
                      setStatusMessage("Global quotation parameters updated successfully!")
                    } catch (err: any) {
                      setStatusMessage(`Failed to update parameters: ${err.message}`)
                    } finally {
                      setLoading(false)
                    }
                  }}
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Save Global Parameters
                </button>
              </div>

            </div>
          )}

          {/* TAB 4: System Logs */}
          {/* TAB: My Account */}
          {activeTab === 'account' && (
            <div className="max-w-lg space-y-6">
              <div className="p-6 rounded-lg bg-slate-900/40 border border-slate-800/80">
                <h3 className="font-semibold text-white text-base flex items-center gap-2 mb-1">
                  <UserCog className="h-5 w-5 text-indigo-400" />
                  Admin account
                </h3>
                <p className="text-xs text-slate-400 mb-6">
                  Signed in as <span className="font-mono text-slate-200">{accountEmail || '…'}</span>. This account belongs to no customer company and only has access to this panel.
                </p>
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    setAccMessage(null)
                    if (accNewPassword && accNewPassword !== accConfirm) {
                      setAccMessage({ ok: false, text: 'The new passwords do not match.' })
                      return
                    }
                    try {
                      const res = await adminUpdateAccount({
                        current_password: accCurrent,
                        new_email: accNewEmail.trim() || undefined,
                        new_password: accNewPassword || undefined,
                      })
                      setAccountEmail(res.email)
                      setAccNewEmail(''); setAccNewPassword(''); setAccConfirm(''); setAccCurrent('')
                      setAccMessage({ ok: true, text: 'Saved. Use the new details next time you sign in.' })
                    } catch (err: any) {
                      setAccMessage({ ok: false, text: err.message })
                    }
                  }}
                >
                  <div>
                    <label className="label">New email (optional)</label>
                    <input type="email" value={accNewEmail} onChange={(e) => setAccNewEmail(e.target.value)} placeholder={accountEmail} className="input" autoComplete="off" />
                  </div>
                  <div>
                    <label className="label">New password (optional, at least 12 characters)</label>
                    <input type="password" value={accNewPassword} onChange={(e) => setAccNewPassword(e.target.value)} className="input" autoComplete="new-password" />
                  </div>
                  {accNewPassword && (
                    <div>
                      <label className="label">Confirm new password</label>
                      <input type="password" value={accConfirm} onChange={(e) => setAccConfirm(e.target.value)} className="input" autoComplete="new-password" />
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-800">
                    <label className="label mt-3">Current password</label>
                    <input type="password" required value={accCurrent} onChange={(e) => setAccCurrent(e.target.value)} className="input" autoComplete="current-password" />
                  </div>
                  {accMessage && (
                    <p className={`text-xs ${accMessage.ok ? 'text-emerald-400' : 'text-red-400'}`}>{accMessage.text}</p>
                  )}
                  <button
                    type="submit"
                    disabled={!accCurrent || (!accNewEmail.trim() && !accNewPassword)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Save account
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="rounded-lg bg-slate-900/40 border border-slate-800/80 overflow-hidden font-mono text-xs shadow-inner">
              <div className="bg-slate-950/80 p-3 border-b border-slate-800/80 flex items-center justify-between text-slate-500">
                <span>SYSTEM LOG STREAM</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
                  Live Stream Active
                </span>
              </div>
              <div className="p-4 max-h-[500px] overflow-y-auto space-y-2 bg-slate-950/20">
                {systemLogs.length === 0 ? (
                  <p className="text-slate-600 italic text-center py-10">No diagnostic logs found.</p>
                ) : (
                  systemLogs.map(log => (
                    <div key={log.id} className="flex gap-2 items-start py-0.5 leading-relaxed">
                      <span className="text-slate-600 shrink-0">{new Date(log.created_at).toISOString()}</span>
                      <span className={`font-semibold shrink-0 ${
                        log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARNING' ? 'text-amber-400' : 'text-slate-400'
                      }`}>
                        [{log.level}]
                      </span>
                      <span className="text-slate-500 shrink-0">({log.source}):</span>
                      <span className="text-slate-300 break-all">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal: Edit Credentials / User Settings */}
        {editingUser && (
          <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-2xl overflow-hidden my-8">
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white text-lg">Configure settings for {editingUser.email}</h3>
                  <p className="text-xs text-slate-500">Changes will be symmetrically encrypted on the database server.</p>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  className="text-slate-400 hover:text-white font-semibold text-sm cursor-pointer"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleUpdateSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Display Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Phone Number</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="e.g. +123456789"
                      className="input"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Company</label>
                  <select
                    value={editCompanyId}
                    onChange={(e) => setEditCompanyId(e.target.value)}
                    className="input"
                  >
                    {!editingUser.company_id || !adminCompanies.some(c => c.id === editingUser.company_id) ? (
                      <option value={editingUser.company_id || ''}>{editingUser.company_name || 'No company'}</option>
                    ) : null}
                    {adminCompanies.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.member_count} user{c.member_count === 1 ? '' : 's'})</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Users in a company share its data, mailbox and API keys. Create new companies in the Companies tab.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Access Role</label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="input"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Reset Password</label>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Enter new password (optional)"
                      className="input"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">API Keys & Credentials Settings</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">AIML API key (leave blank to use the server key)</label>
                      <input
                        type="password"
                        value={editGeminiKey}
                        onChange={(e) => setEditGeminiKey(e.target.value)}
                        placeholder={editingUser.has_gemini_key ? "•••••••••••• (Leave blank to keep current)" : "Enter API key"}
                        className="input"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Gmail SMTP Email Address</label>
                        <input
                          type="text"
                          value={editGmailEmail}
                          onChange={(e) => setEditGmailEmail(e.target.value)}
                          placeholder={editingUser.has_gmail_email ? "•••••••••••• (Leave blank to keep)" : "email@gmail.com"}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Gmail SMTP App Password</label>
                        <input
                          type="password"
                          value={editGmailPassword}
                          onChange={(e) => setEditGmailPassword(e.target.value)}
                          placeholder={editingUser.has_gmail_password ? "•••••••••••• (Leave blank to keep)" : "App Password"}
                          className="input"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 border-t border-slate-800/40 pt-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Twilio Account SID</label>
                        <input
                          type="text"
                          value={editTwilioSid}
                          onChange={(e) => setEditTwilioSid(e.target.value)}
                          placeholder="AC..."
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Twilio Auth Token</label>
                        <input
                          type="password"
                          value={editTwilioToken}
                          onChange={(e) => setEditTwilioToken(e.target.value)}
                          placeholder="Token"
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Twilio WhatsApp Phone</label>
                        <input
                          type="text"
                          value={editTwilioPhone}
                          onChange={(e) => setEditTwilioPhone(e.target.value)}
                          placeholder="whatsapp:+1..."
                          className="input"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-4 flex gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save Settings
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Create User Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4">
            <div className="w-full max-w-md p-6 bg-slate-900 border border-slate-800/80 rounded-lg">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
                <h3 className="font-semibold text-white text-base">Create New User Account</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email"
                    required
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    className="input"
                    placeholder="user@example.com"
                  />
                </div>

                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    required
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="input"
                    placeholder="Minimum 8 characters"
                  />
                </div>

                <div>
                  <label className="label">Full Name (Optional)</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="input"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="label">Phone Number (Optional)</label>
                  <input
                    type="text"
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    className="input"
                    placeholder="+123456789"
                  />
                </div>

                <div>
                  <label className="label">Company</label>
                  <select
                    value={createCompany}
                    onChange={(e) => setCreateCompany(e.target.value)}
                    className="input"
                  >
                    <option value="new">+ New separate company</option>
                    {adminCompanies.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.member_count} user{c.member_count === 1 ? '' : 's'})</option>
                    ))}
                  </select>
                  {createCompany === 'new' ? (
                    <>
                      <input
                        type="text"
                        value={createCompanyName}
                        onChange={(e) => setCreateCompanyName(e.target.value)}
                        className="input mt-2"
                        placeholder="Company name (optional)"
                      />
                      <label className="label mt-3">Plan</label>
                      <select value={createPlan} onChange={(e) => setCreatePlan(e.target.value as PlanId)} className="input">
                        {PLAN_OPTIONS.map(p => (
                          <option key={p.id} value={p.id}>{p.label}: {p.users}, {p.quotes}</option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <p className="text-[11px] text-slate-500 mt-1">
                      The user joins this company and shares its data, mailbox and API keys.
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">System Role</label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value)}
                    className="input"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold cursor-pointer flex items-center gap-1"
                  >
                    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Create Account
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
      {/* Company dialog: plan, limits, status and billing */}
      {planCompany && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) setPlanCompany(null) }}>
          <div role="dialog" aria-modal="true" className="w-full max-w-2xl rounded-lg border border-slate-800 bg-slate-900 p-6 space-y-6 my-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-white">Manage {planCompany.name}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {planCompany.member_count} user{planCompany.member_count === 1 ? '' : 's'} · {planCompany.quotes_this_month ?? 0} AI quotes this month · {planCompany.kb_files ?? 0} price files ·
                  {' '}mailbox {planCompany.mailbox_connected ? 'connected' : 'not connected'} · WhatsApp {planCompany.whatsapp_connected ? 'connected' : 'not connected'}
                </p>
              </div>
              <button onClick={() => setPlanCompany(null)} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plan</p>
                {PLAN_OPTIONS.map(p => (
                  <label key={p.id} className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 cursor-pointer ${planChoice === p.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 hover:border-slate-700'}`}>
                    <input type="radio" name="plan" checked={planChoice === p.id} onChange={() => setPlanChoice(p.id)} />
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-white">{p.label}</span>
                      <span className="block text-xs text-slate-400">{p.users} · {p.quotes}</span>
                    </span>
                  </label>
                ))}
                <div>
                  <p className="label">Custom limits (optional)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" min={1} value={planMaxUsers} onChange={(e) => setPlanMaxUsers(e.target.value)} placeholder="Max users" className="input" />
                    <input type="number" min={0} value={planMaxQuotes} onChange={(e) => setPlanMaxQuotes(e.target.value)} placeholder="AI quotes / month" className="input" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Blank uses the plan's limits.</p>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Billing and access</p>
                <div>
                  <label className="label">Status</label>
                  <select value={billStatus} onChange={(e) => setBillStatus(e.target.value as 'active' | 'suspended')} className="input">
                    <option value="active">Active</option>
                    <option value="suspended">Suspended (locked out, e.g. unpaid)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Next invoice date</label>
                  <input type="date" value={billNextInvoice} onChange={(e) => setBillNextInvoice(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Billing contact email</label>
                  <input type="email" value={billContact} onChange={(e) => setBillContact(e.target.value)} placeholder="accounts@customer.com" className="input" />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={billSetupPaid} onChange={(e) => setBillSetupPaid(e.target.checked)} />
                  Setup fee paid
                </label>
                <div>
                  <label className="label">Notes</label>
                  <textarea rows={3} value={billNotes} onChange={(e) => setBillNotes(e.target.value)} placeholder="e.g. Payoneer invoice #12 sent 1 Dec; pays annually" className="input resize-none" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setPlanCompany(null)} className="px-4 py-2 rounded-lg border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer">Cancel</button>
              <button onClick={savePlan} disabled={loading} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}
