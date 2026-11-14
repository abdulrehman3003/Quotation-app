import React, { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useWorkspaceStore } from '../store/workspaceStore'
import {
  LayoutDashboard,
  FileSpreadsheet,
  Database,
  LogOut,
  Workflow,
  Mail,
  MessageSquare,
  Settings,
  Bell,
  Users,
  type LucideIcon
} from 'lucide-react'

// PII masking utility for email rendering in the UI
const maskEmail = (email: string | undefined): string => {
  if (!email) return ''
  const [name, domain] = email.split('@')
  if (!name || !domain) return email
  if (name.length <= 2) return `*@${domain}`
  return `${name.slice(0, 2)}***${name.slice(-1)}@${domain}`
}

const initialsOf = (name: string | undefined, email: string | undefined): string => {
  const source = (name || email || '').trim()
  if (!source) return '?'
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return (parts[0]?.[0] || '').concat(parts[1]?.[0] || '').toUpperCase() || '?'
}

interface NavItem {
  label: string
  icon: LucideIcon
  path: string
  count?: number
}

export const Sidebar: React.FC = () => {
  const navigate = useNavigate()
  const { user, signOut } = useAuthStore()

  const {
    userProfile,
    emails,
    whatsappChats,
    notifications,
    markNotificationsAsRead,
    fetchEmails,
    fetchChats
  } = useWorkspaceStore()

  const [showNotifications, setShowNotifications] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Background polling keeps channel counts and notifications current
  useEffect(() => {
    fetchEmails().catch(() => {})
    fetchChats().catch(() => {})
    const interval = setInterval(() => {
      fetchEmails().catch(() => {})
      fetchChats().catch(() => {})
    }, 12000)
    return () => clearInterval(interval)
  }, [fetchEmails, fetchChats])

  // Close the notification popover on outside click or Escape
  useEffect(() => {
    if (!showNotifications) return
    const onPointerDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNotifications(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showNotifications])

  const unreadNotifications = notifications.filter((n) => !n.read).length
  const unreadEmails = emails.filter((e) => e.status === 'unread').length
  const escalatedChats = whatsappChats.filter((c) => c.status === 'human_required').length

  const groups: { heading: string; items: NavItem[] }[] = [
    {
      heading: 'Workspace',
      items: [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
        { label: 'Pipeline', icon: Workflow, path: '/workspace' },
        { label: 'Knowledge base', icon: Database, path: '/kb' },
        { label: 'Customers', icon: Users, path: '/customers' },
        { label: 'Reports', icon: FileSpreadsheet, path: '/reports' }
      ]
    },
    {
      heading: 'Channels',
      items: [
        { label: 'Email', icon: Mail, path: '/emails', count: unreadEmails },
        { label: 'WhatsApp', icon: MessageSquare, path: '/whatsapp', count: escalatedChats }
      ]
    },
    {
      heading: 'Account',
      items: [{ label: 'Settings', icon: Settings, path: '/profile' }]
    }
  ]

  const displayName = userProfile?.name || maskEmail(user?.email)

  return (
    <aside className="w-60 h-screen shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Brand + notifications */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-brand-600 flex items-center justify-center text-white text-sm font-semibold">
            A
          </div>
          <span className="text-sm font-semibold tracking-wide text-slate-50">AXRFLOWS</span>
        </div>

        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => {
              if (!showNotifications) markNotificationsAsRead()
              setShowNotifications(!showNotifications)
            }}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors cursor-pointer"
            aria-label={unreadNotifications > 0 ? `Notifications, ${unreadNotifications} unread` : 'Notifications'}
            aria-expanded={showNotifications}
          >
            <Bell className="w-4 h-4" />
            {unreadNotifications > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-slate-900" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute left-0 top-10 z-50 w-80 rounded-lg border border-slate-800 bg-slate-900 shadow-popover">
              <div className="px-4 py-3 border-b border-slate-800">
                <p className="text-sm font-semibold text-slate-100">Notifications</p>
              </div>
              <div className="max-h-80 overflow-y-auto py-1">
                {notifications.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-slate-500">You're all caught up.</p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setShowNotifications(false)
                        navigate(n.type === 'email' ? '/emails' : '/whatsapp')
                      }}
                      className="w-full text-left px-4 py-2.5 flex gap-3 hover:bg-slate-850 transition-colors cursor-pointer"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-800 text-slate-300">
                        {n.type === 'email' ? <Mail className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs font-medium text-slate-200">{n.title}</span>
                          <span className="shrink-0 text-[11px] text-slate-500">
                            {new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">{n.description}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {groups.map((group) => (
          <div key={group.heading}>
            <p className="eyebrow px-2 mb-1.5">{group.heading}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `relative flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm transition-colors ${
                        isActive
                          ? 'bg-slate-800 text-slate-50 font-medium before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-brand-400'
                          : 'text-slate-400 hover:bg-slate-850 hover:text-slate-100'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {!!item.count && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand-500/20 text-brand-200 text-[11px] font-medium flex items-center justify-center tabular-nums">
                        {item.count}
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Account footer */}
      <div className="p-3 border-t border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5 px-1">
          <div className="h-8 w-8 shrink-0 rounded-full bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center">
            {initialsOf(userProfile?.name, user?.email)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-100" title={user?.email}>
              {displayName}
            </p>
            <p className="truncate text-xs text-slate-500">{userProfile?.company_name || 'Personal workspace'}</p>
          </div>
          <button
            onClick={signOut}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors cursor-pointer"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
