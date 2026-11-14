import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useWorkspaceStore } from './store/workspaceStore'
import { supabase } from './lib/supabase'
import { Auth } from './pages/Auth'
import { Onboarding } from './pages/Onboarding'
import { LandingPage } from './pages/LandingPage'
import { Dashboard } from './pages/Dashboard'
import { PipelineWorkspace } from './pages/PipelineWorkspace'
import { KnowledgeBase } from './pages/KnowledgeBase'
import Emails from './pages/Emails'
import WhatsAppDashboard from './pages/WhatsAppDashboard'
import UserProfileSettings from './pages/UserProfileSettings'
import QuotationReports from './pages/QuotationReports'
import AdminPanel from './pages/AdminPanel'
import { PublicQuote } from './pages/PublicQuote'
import { Customers } from './pages/Customers'
import { Sidebar } from './components/Sidebar'
import { Lock, LogIn } from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

// Admin Login Screen: authenticates with Supabase; admin rights are verified server-side
const AdminLogin: React.FC<{ initialError?: string }> = ({ initialError }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(initialError || '')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setError(initialError || '')
  }, [initialError])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    })
    if (authError) {
      setError(authError.message)
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-lg bg-slate-900/60 border border-slate-800/80">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-lg bg-indigo-600 flex items-center justify-center mb-3">
            <Lock className="text-white h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-white">AXRFLOWS Admin Portal</h1>
          <p className="text-xs text-slate-400 mt-1">Sign in with an account that has the admin role</p>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="label">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <LogIn className="h-4 w-4" />
            {submitting ? 'Signing in...' : 'Login as Admin'}
          </button>
        </form>
      </div>
    </div>
  )
}

// Protected Onboarding Route Wrapper
const ProtectedOnboarding: React.FC = () => {
  const { session, loading } = useAuthStore()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/auth" replace />
  }

  return <Onboarding />
}

// Protected Router Layout for Normal Users
const ProtectedLayout: React.FC = () => {
  const { session, loading } = useAuthStore()
  const { userProfile, fetchProfile } = useWorkspaceStore()
  const [checkingProfile, setCheckingProfile] = useState(true)

  useEffect(() => {
    if (!session) {
      setCheckingProfile(false)
      return
    }
    let cancelled = false
    if (userProfile && userProfile.id === session.user?.id) {
      setCheckingProfile(false)
      return
    }
    setCheckingProfile(true)
    fetchProfile()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCheckingProfile(false)
      })
    return () => {
      cancelled = true
    }
  }, [session, userProfile, fetchProfile])

  if (loading || checkingProfile) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/auth" replace />
  }

  // Redirect un-onboarded regular users to the Onboarding Wizard
  if (userProfile && !userProfile.onboarding_completed && userProfile.role !== 'admin') {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        <Outlet />
      </main>
    </div>
  )
}

// Full Admin Portal: requires a Supabase session whose profile role is 'admin'
const AdminPortal: React.FC = () => {
  const { session, loading } = useAuthStore()
  const [roleState, setRoleState] = useState<'checking' | 'admin' | 'denied'>('checking')
  const [denyReason, setDenyReason] = useState('')

  useEffect(() => {
    if (!session) {
      setRoleState('checking')
      return
    }
    let cancelled = false
    setRoleState('checking')
    fetch(`${BACKEND_URL}/api/users/profile`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to verify account role')
        const profile = await res.json()
        if (cancelled) return
        if (profile.role === 'admin') {
          setRoleState('admin')
        } else {
          setDenyReason('This account does not have admin access.')
          setRoleState('denied')
          await supabase.auth.signOut()
        }
      })
      .catch((err) => {
        if (cancelled) return
        setDenyReason(err.message)
        setRoleState('denied')
      })
    return () => {
      cancelled = true
    }
  }, [session])

  if (loading || (session && roleState === 'checking')) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!session || roleState !== 'admin') {
    return <AdminLogin initialError={denyReason} />
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="w-64 h-screen bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-6">
        <div>
          <div className="flex items-center gap-3 pb-6 border-b border-slate-800 mb-6">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-semibold text-lg">A</span>
            </div>
            <span className="text-xl font-semibold text-white">ADMIN APP</span>
          </div>
          <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-2">System Controls</p>
          <div className="text-sm font-semibold text-slate-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 rounded-lg">
            Active Control Room
          </div>
        </div>

        <button
          onClick={async () => {
            await supabase.auth.signOut()
          }}
          className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-semibold cursor-pointer transition-colors"
        >
          Logout Admin
        </button>
      </div>
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        <AdminPanel />
      </main>
    </div>
  )
}

export const App: React.FC = () => {
  const { initialize, loading } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  const isSubdomain = window.location.hostname.startsWith('admin.')

  if (isSubdomain) {
    return <AdminPortal />
  }

  // Customer-facing quote links need no session: render them without waiting on auth.
  if (window.location.pathname.startsWith('/q/')) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/q/:token" element={<PublicQuote />} />
        </Routes>
      </BrowserRouter>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Landing Page Route */}
        <Route path="/" element={<LandingPage />} />

        {/* Auth Route */}
        <Route path="/auth" element={<Auth />} />

        {/* Onboarding Wizard Route */}
        <Route path="/onboarding" element={<ProtectedOnboarding />} />

        {/* Admin Portal Route (direct path fallback for Vercel/non-subdomain envs) */}
        <Route path="/admin" element={<AdminPortal />} />

        {/* Protected Dashboard/Workspace Routes */}
        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/workspace" element={<PipelineWorkspace />} />
          <Route path="/kb" element={<KnowledgeBase />} />
          <Route path="/emails" element={<Emails />} />
          <Route path="/whatsapp" element={<WhatsAppDashboard />} />
          <Route path="/reports" element={<QuotationReports />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/profile" element={<UserProfileSettings />} />
        </Route>

        {/* Global redirects */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
export default App
