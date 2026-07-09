import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useWorkspaceStore } from '../store/workspaceStore'
import { 
  LayoutDashboard, 
  FileSpreadsheet, 
  Database, 
  LogOut, 
  Terminal, 
  Mail, 
  MessageSquare, 
  User, 
  Bell,
  X 
} from 'lucide-react'

// PII Masking utility for email rendering in UI
const maskEmail = (email: string | undefined): string => {
  if (!email) return ''
  const [name, domain] = email.split('@')
  if (!name || !domain) return email
  if (name.length <= 2) return `*@${domain}`
  return `${name.slice(0, 2)}***${name.slice(-1)}@${domain}`
}

export const Sidebar: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signOut } = useAuthStore()
  
  const { 
    notifications, 
    markNotificationsAsRead, 
    fetchEmails, 
    fetchChats 
  } = useWorkspaceStore()

  const [showNotifications, setShowNotifications] = useState(false)

  // Polling for background notifications updates
  useEffect(() => {
    fetchEmails().catch(() => {})
    fetchChats().catch(() => {})
    const interval = setInterval(() => {
      fetchEmails().catch(() => {})
      fetchChats().catch(() => {})
    }, 12000)
    return () => clearInterval(interval)
  }, [fetchEmails, fetchChats])

  const unreadCount = notifications.filter(n => !n.read).length

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Pipeline Workspace', icon: Terminal, path: '/workspace' },
    { label: 'Knowledge Base', icon: Database, path: '/kb' },
    { label: 'Emails', icon: Mail, path: '/emails' },
    { label: 'WhatsApp Portal', icon: MessageSquare, path: '/whatsapp' },
    { label: 'Quotation Reports', icon: FileSpreadsheet, path: '/reports' },
    { label: 'Profile Settings', icon: User, path: '/profile' },
  ]

  return (
    <div className="w-64 h-screen bg-slate-900 border-r border-slate-800 flex flex-col justify-between relative">
      <div>
        {/* Brand Header */}
        <div className="p-6 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shadow-glow-sm">
              <span className="text-white font-extrabold font-outfit text-lg">A</span>
            </div>
            <span className="text-xl font-extrabold font-outfit tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-brand-400">
              AXRFLOWS
            </span>
          </div>

          {/* Notification Bell */}
          <div className="relative shrink-0">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications)
                if (!showNotifications) {
                  markNotificationsAsRead()
                }
              }}
              className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200 transition-all cursor-pointer relative"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 min-w-[16px] text-center border border-slate-900 animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-brand-500/10 border border-brand-500/30 text-brand-400 shadow-glow-sm'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* User Footer Profile & Logout */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center justify-between gap-2 px-2 py-3 rounded-lg bg-slate-950/40 border border-slate-800/40 mb-3">
          <div className="overflow-hidden">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Tenant Profile</p>
            <p className="text-sm font-medium text-slate-300 truncate" title={user?.email}>
              {maskEmail(user?.email)}
            </p>
          </div>
        </div>
        
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/5 border border-transparent hover:border-red-500/20 transition-all duration-200"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>

      {/* Floating Notifications Dropdown Panel */}
      {showNotifications && (
        <div className="absolute left-66 top-16 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 p-4 flex flex-col gap-3 max-h-[400px] overflow-y-auto animate-in fade-in slide-in-from-left-5 duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent Notifications</span>
            <button
              onClick={() => setShowNotifications(false)}
              className="text-slate-500 hover:text-slate-300 p-0.5 hover:bg-slate-800 rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            {notifications.length === 0 ? (
              <p className="text-slate-500 text-xs italic text-center py-6">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setShowNotifications(false)
                    navigate(n.type === 'email' ? '/emails' : '/whatsapp')
                  }}
                  className="w-full text-left p-2.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950 transition-all flex flex-col gap-1 text-xs cursor-pointer group"
                >
                  <div className="flex justify-between items-center w-full">
                    <span className={`font-semibold text-slate-200 group-hover:text-white flex items-center gap-1.5 ${
                      !n.read ? 'before:w-1.5 before:h-1.5 before:bg-indigo-500 before:rounded-full' : ''
                    }`}>
                      {n.title}
                    </span>
                    <span className="text-[9px] text-slate-500">
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[10.5px] truncate max-w-[240px] leading-snug">{n.description}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
