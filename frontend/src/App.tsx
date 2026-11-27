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
import { PrivacyPolicy } from './pages/legal/PrivacyPolicy'
import { TermsOfService } from './pages/legal/TermsOfService'
import { DataProcessingAgreement } from './pages/legal/DataProcessingAgreement'
import { SecurityPage } from './pages/legal/SecurityPage'
import { AcceptableUse } from './pages/legal/AcceptableUse'
import { CookiePolicy } from './pages/legal/CookiePolicy'

const legalRoutes = (
  <>
    <Route path="/privacy" element={<PrivacyPolicy />} />
    <Route path="/terms" element={<TermsOfService />} />
    <Route path="/dpa" element={<DataProcessingAgreement />} />
    <Route path="/security" element={<SecurityPage />} />
    <Route path="/acceptable-use" element={<AcceptableUse />} />
    <Route path="/cookies" element={<CookiePolicy />} />
  </>
)
import { Sidebar } from './components/Sidebar'
import { NoticeBanner, NoticeCard } from './components/CompanyNotices'
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
          <h1 className="text-xl font-semibold text-white">AxrflowsQuotes Admin Portal</h1>
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

// Shown to a signed-in account that an admin has not approved (open sign-up is closed).
const PendingApproval: React.FC = () => {
  const { signOut } = useAuthStore()
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
          <Lock className="h-5 w-5 text-slate-300" />
        </div>
        <h1 className="text-lg font-semibold text-white">Your account is waiting for approval</h1>
        <p className="mt-3 text-sm text-slate-400 leading-relaxed">
          AxrflowsQuotes workspaces are set up for each business by our team. We will let you know when yours is ready.
          If you were invited by a colleague, open the invite link they sent you.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-6 px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 hover:border-slate-500 transition-colors cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

// Shown to users of a company the admin has suspended (e.g. unpaid invoice).
const WorkspaceSuspended: React.FC = () => {
  const { signOut } = useAuthStore()
  const { companyNotices, fetchCompanyNotices } = useWorkspaceStore()
  useEffect(() => {
    fetchCompanyNotices()
  }, [fetchCompanyNotices])
  const due = companyNotices.filter((n) => n.kind === 'payment' && !n.resolved)
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
          <Lock className="h-5 w-5 text-slate-300" />
        </div>
        <h1 className="text-lg font-semibold text-white">This workspace is paused</h1>
        <p className="mt-3 text-sm text-slate-400 leading-relaxed">
          Your company's AxrflowsQuotes access is on hold. Please contact AxrflowsQuotes to restore it. Your data is kept safe in the meantime.
        </p>
        {due.length > 0 && (
          <div className="mt-6 space-y-3 text-left rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            {due.map((n) => <NoticeCard key={n.id} notice={n} />)}
          </div>
        )}
        <button
          onClick={() => signOut()}
          className="mt-6 px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 hover:border-slate-500 transition-colors cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

// Protected Onboarding Route Wrapper
const ProtectedOnboarding: React.FC = () => {
  const { session, loading } = useAuthStore()
  const { userProfile } = useWorkspaceStore()

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

  if (userProfile && userProfile.access_approved === false) {
    return <PendingApproval />
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

  if (userProfile && userProfile.access_approved === false) {
    return <PendingApproval />
  }

  if (userProfile && userProfile.workspace_suspended) {
    return <WorkspaceSuspended />
  }

  // The admin belongs to no customer company: their home is the admin panel.
  if (userProfile && userProfile.role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  // Redirect un-onboarded regular users to the Onboarding Wizard
  if (userProfile && !userProfile.onboarding_completed && userProfile.role !== 'admin') {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        <NoticeBanner />
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

  // The admin panel draws its own left sidebar (navigation and sign-out).
  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <AdminPanel />
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

        {legalRoutes}

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
