import React, { useEffect, useState } from 'react'
import { useWorkspaceStore } from '../store/workspaceStore'
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
  X
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
    fetchSystemStatus,
    fetchSystemLogs,
    fetchAdminSettings,
    saveAdminSettings,
    error
  } = useWorkspaceStore()

  const [activeTab, setActiveTab] = useState<'users' | 'keys' | 'database' | 'settings' | 'logs'>('users')
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  
  // Settings tab state
  const [baseLaborRate, setBaseLaborRate] = useState('50.00')
  const [baseMaterialMarkup, setBaseMaterialMarkup] = useState('1.20')
  const [adminNewPassword, setAdminNewPassword] = useState('')

  // User creation state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createName, setCreateName] = useState('')
  const [createPhone, setCreatePhone] = useState('')
  const [createRole, setCreateRole] = useState('user')

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
  
  useEffect(() => {
    setLoading(true)
    Promise.all([
      adminListUsers(),
      fetchSystemStatus(),
      fetchSystemLogs(),
      fetchAdminSettings().catch(() => {})
    ]).finally(() => setLoading(false))
  }, [adminListUsers, fetchSystemStatus, fetchSystemLogs, fetchAdminSettings])

  useEffect(() => {
    if (adminSettings) {
      setBaseLaborRate(String(adminSettings.base_labor_rate))
      setBaseMaterialMarkup(String(adminSettings.base_material_markup))
    }
  }, [adminSettings])

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
  }

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setLoading(true)
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
        role: createRole
      })
      setCreateEmail('')
      setCreatePassword('')
      setCreateName('')
      setCreatePhone('')
      setCreateRole('user')
      setShowCreateModal(false)
      setStatusMessage('New user account created successfully.')
    } catch (err: any) {
      setStatusMessage(err.message || 'Failed to create user.')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setLoading(true)
    await Promise.all([
      adminListUsers(),
      fetchSystemStatus(),
      fetchSystemLogs()
    ])
    setLoading(false)
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="border-b border-slate-800 pb-6 mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <Shield className="h-8 w-8 text-indigo-400" />
              Admin Portal Panel
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Configure encrypted API keys, manage user accounts, inspect database stats, and view server log streams.
            </p>
          </div>

          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Sync Status
          </button>
        </div>

        {/* System Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/80">
            <div className="flex justify-between items-start text-slate-500">
              <span className="text-xs uppercase font-bold tracking-wider">Backend Server</span>
              <Server className="h-5 w-5 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold mt-2 text-white">Active</p>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
              Listening Port 8000
            </span>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/80">
            <div className="flex justify-between items-start text-slate-500">
              <span className="text-xs uppercase font-bold tracking-wider">Supabase Status</span>
              <Database className="h-5 w-5 text-brand-400" />
            </div>
            <p className="text-2xl font-bold mt-2 text-white">
              {systemStatus?.database_status === 'healthy' ? 'Connected' : 'Offline'}
            </p>
            <span className={`text-[10px] flex items-center gap-1 mt-1 ${
              systemStatus?.database_status === 'healthy' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {systemStatus?.database_status === 'healthy' ? 'RLS Policies Enabled' : 'Check API Settings'}
            </span>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/80">
            <div className="flex justify-between items-start text-slate-500">
              <span className="text-xs uppercase font-bold tracking-wider">Registered Tenants</span>
              <Users className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold mt-2 text-white">{adminUsers.length}</p>
            <span className="text-[10px] text-slate-500 mt-1">Active Client Profiles</span>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/80">
            <div className="flex justify-between items-start text-slate-500">
              <span className="text-xs uppercase font-bold tracking-wider">Diagnostic Logs</span>
              <Terminal className="h-5 w-5 text-amber-400" />
            </div>
            <p className="text-2xl font-bold mt-2 text-white">{systemLogs.length}</p>
            <span className="text-[10px] text-slate-500 mt-1">Logged Incidents</span>
          </div>
        </div>

        {statusMessage && (
          <div className="p-4 mb-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm">
            {statusMessage}
          </div>
        )}

        {/* Tab Controls */}
        <div className="flex border-b border-slate-800 mb-6 gap-2">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'users' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Users className="h-4 w-4" />
            User Management
          </button>
          
          <button
            onClick={() => setActiveTab('keys')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'keys' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Key className="h-4 w-4" />
            Encrypted API Keys
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'database' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Database className="h-4 w-4" />
            Supabase Stats
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'settings' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Settings className="h-4 w-4" />
            System Settings
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'logs' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Terminal className="h-4 w-4" />
            System logs
          </button>
        </div>

        {/* Tab Content Panel */}
        <div className="min-h-[400px]">
          {/* TAB 1: User Management */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-900/20 p-4 border border-slate-800 rounded-xl">
                <div>
                  <h3 className="font-bold text-white">User Base Directory</h3>
                  <p className="text-xs text-slate-400">Total registered client tenants: {adminUsers.length}</p>
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Plus className="h-4 w-4" />
                  Add New User
                </button>
              </div>

              <div className="rounded-xl bg-slate-900/40 border border-slate-800/80 overflow-hidden">
                <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Tenant Email</th>
                    <th className="px-6 py-4">Name</th>
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
                      <td className="px-6 py-4 font-mono text-xs">{user.phone_number || <span className="text-slate-600 italic">None</span>}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                          user.role === 'admin' 
                            ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' 
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {user.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEditClick(user)}
                          className="p-1.5 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300 rounded transition-all cursor-pointer"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(user.id)}
                          className="p-1.5 hover:bg-slate-800 text-red-400 hover:text-red-300 rounded transition-all cursor-pointer"
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
          {activeTab === 'keys' && (
            <div className="grid grid-cols-1 gap-6 max-w-4xl">
              {adminUsers.map(user => (
                <div key={user.id} className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
                    <div>
                      <h3 className="font-bold text-white text-base">{user.name || 'Unnamed Client'}</h3>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                    <button
                      onClick={() => handleEditClick(user)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <Key className="h-3.5 w-3.5" />
                      Configure Keys
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <Key className={`h-4 w-4 ${user.has_gemini_key ? 'text-emerald-400' : 'text-slate-600'}`} />
                      <span>Gemini API Key: <strong>{user.has_gemini_key ? 'Encrypted' : 'Missing'}</strong></span>
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
              <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                  <Database className="h-5 w-5 text-indigo-400" />
                  Table Row Statistics
                </h3>
                <div className="space-y-3 text-sm">
                  {systemStatus?.table_stats ? (
                    Object.entries(systemStatus.table_stats).map(([table, count]) => (
                      <div key={table} className="flex justify-between items-center py-1 border-b border-slate-800/40 font-mono">
                        <span className="text-slate-400">{table.replace('_count', '')}</span>
                        <span className="text-white font-bold">{count as number}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500 italic">No table data loaded.</p>
                  )}
                </div>
              </div>

              <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                  <Settings className="h-5 w-5 text-emerald-400" />
                  Global Parameters Defaults
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Default multipliers used globally if a tenant does not override them.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Base Labor Rate / Hour</label>
                    <input
                      type="text"
                      defaultValue="$60.00"
                      disabled
                      className="w-full bg-slate-950 border border-slate-800/80 rounded px-3 py-2 text-xs text-slate-400 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Base Material Markup %</label>
                    <input
                      type="text"
                      defaultValue="20%"
                      disabled
                      className="w-full bg-slate-950 border border-slate-800/80 rounded px-3 py-2 text-xs text-slate-400 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: System Settings */}
          {activeTab === 'settings' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Global Quotation Parameters Card */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6">
                <h3 className="font-bold text-white text-base flex items-center gap-2 mb-2">
                  <Settings className="h-5 w-5 text-indigo-400" />
                  Global Quotation Parameters
                </h3>
                <p className="text-xs text-slate-400 mb-6">
                  Set the default values that will be used by the AI engine globally for all quotation calculations.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Base Labor Rate ($ / Hour)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={baseLaborRate}
                      onChange={(e) => setBaseLaborRate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-all font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Base Material Markup Multiplier
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={baseMaterialMarkup}
                      onChange={(e) => setBaseMaterialMarkup(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-all font-mono"
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
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-lg hover:shadow-indigo-500/20"
                >
                  Save Global Parameters
                </button>
              </div>

              {/* Admin Account Security Settings Card */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6">
                <h3 className="font-bold text-white text-base flex items-center gap-2 mb-2">
                  <Shield className="h-5 w-5 text-indigo-400" />
                  Admin Account Security
                </h3>
                <p className="text-xs text-slate-400 mb-6">
                  Update the password used to access the Administrative Panel bypass.
                </p>

                <div className="max-w-md mb-6">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    New Admin Password
                  </label>
                  <input
                    type="password"
                    placeholder="Enter new admin password"
                    value={adminNewPassword}
                    onChange={(e) => setAdminNewPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>

                <button
                  onClick={() => {
                    if (!adminNewPassword) {
                      setStatusMessage("Please enter a new password.")
                      return
                    }
                    localStorage.setItem('admin_password', adminNewPassword)
                    setAdminNewPassword('')
                    setStatusMessage("Admin password updated successfully in local session!")
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-lg hover:shadow-indigo-500/20"
                >
                  Change Admin Password
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: System Logs */}
          {activeTab === 'logs' && (
            <div className="rounded-xl bg-slate-900/40 border border-slate-800/80 overflow-hidden font-mono text-xs shadow-inner">
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
                      <span className={`font-bold shrink-0 ${
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
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-lg">Configure settings for {editingUser.email}</h3>
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
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Phone Number</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="e.g. +123456789"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Access Role</label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reset Password</label>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Enter new password (optional)"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">API Keys & Credentials Settings</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Gemini API Key (Google OpenAI Endpoint)</label>
                      <input
                        type="password"
                        value={editGeminiKey}
                        onChange={(e) => setEditGeminiKey(e.target.value)}
                        placeholder={editingUser.has_gemini_key ? "•••••••••••• (Leave blank to keep current)" : "Enter API key"}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
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
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Gmail SMTP App Password</label>
                        <input
                          type="password"
                          value={editGmailPassword}
                          onChange={(e) => setEditGmailPassword(e.target.value)}
                          placeholder={editingUser.has_gmail_password ? "•••••••••••• (Leave blank to keep)" : "App Password"}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none"
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
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Twilio Auth Token</label>
                        <input
                          type="password"
                          value={editTwilioToken}
                          onChange={(e) => setEditTwilioToken(e.target.value)}
                          placeholder="Token"
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Twilio WhatsApp Phone</label>
                        <input
                          type="text"
                          value={editTwilioPhone}
                          onChange={(e) => setEditTwilioPhone(e.target.value)}
                          placeholder="whatsapp:+1..."
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-4 flex gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save Settings
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold cursor-pointer transition-all"
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
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md p-6 bg-slate-900 border border-slate-800/80 rounded-xl shadow-2xl">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
                <h3 className="font-bold text-white text-base">Create New User Account</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none"
                    placeholder="user@example.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none"
                    placeholder="Minimum 8 characters"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Full Name (Optional)</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Phone Number (Optional)</label>
                  <input
                    type="text"
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none"
                    placeholder="+123456789"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">System Role</label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none"
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
    </div>
  )
}
