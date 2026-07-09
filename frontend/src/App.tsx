import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { Auth } from './pages/Auth'
import { Dashboard } from './pages/Dashboard'
import { PipelineWorkspace } from './pages/PipelineWorkspace'
import { KnowledgeBase } from './pages/KnowledgeBase'
import Emails from './pages/Emails'
import WhatsAppDashboard from './pages/WhatsAppDashboard'
import UserProfileSettings from './pages/UserProfileSettings'
import QuotationReports from './pages/QuotationReports'
import AdminPanel from './pages/AdminPanel'
import { Sidebar } from './components/Sidebar'
import { Lock, LogIn } from 'lucide-react'

// Simple Admin Login Screen for the admin subdomain
const AdminSubdomainLogin: React.FC<{ onLoginSuccess: () => void }> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    const savedPassword = localStorage.getItem('admin_password') || 'admin'
    if (username === 'admin' && password === savedPassword) {
      onLoginSuccess()
    } else {
      setError('Invalid admin credentials.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-lg bg-indigo-600 flex items-center justify-center mb-3">
            <Lock className="text-white h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-white">AXRFLOWS Admin Portal</h1>
          <p className="text-xs text-slate-400 mt-1">Please enter system admin credentials</p>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-4 py-2.5 text-sm text-slate-200 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-4 py-2.5 text-sm text-slate-200 outline-none"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <LogIn className="h-4 w-4" />
            Login as Admin
          </button>
        </form>
      </div>
    </div>
  )
}

// Protected Router Layout for Normal Users
const ProtectedLayout: React.FC = () => {
  const { session, loading, initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950 bg-grid">
        <Outlet />
      </main>
    </div>
  )
}

export const App: React.FC = () => {
  const { initialize, loading } = useAuthStore()
  const [isAdminAuth, setIsAdminAuth] = useState(
    localStorage.getItem('admin_auth_success') === 'true'
  )

  useEffect(() => {
    initialize()
  }, [initialize])

  const isSubdomain = window.location.hostname.startsWith('admin.')
  
  if (isSubdomain) {
    if (!isAdminAuth) {
      return (
        <AdminSubdomainLogin
          onLoginSuccess={() => {
            setIsAdminAuth(true)
            localStorage.setItem('admin_auth_success', 'true')
          }}
        />
      )
    }

    return (
      <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
        <div className="w-64 h-screen bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-6">
          <div>
            <div className="flex items-center gap-3 pb-6 border-b border-slate-800 mb-6">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-glow-sm">
                <span className="text-white font-extrabold text-lg">A</span>
              </div>
              <span className="text-xl font-extrabold text-white">ADMIN APP</span>
            </div>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">System Controls</p>
            <div className="text-sm font-semibold text-slate-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 rounded-lg">
              Active Control Room
            </div>
          </div>

          <button
            onClick={() => {
              setIsAdminAuth(false)
              localStorage.removeItem('admin_auth_success')
            }}
            className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-semibold cursor-pointer transition-all"
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
        {/* Auth Route */}
        <Route path="/auth" element={<Auth />} />

        {/* Protected Dashboard/Workspace Routes */}
        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/workspace" element={<PipelineWorkspace />} />
          <Route path="/kb" element={<KnowledgeBase />} />
          <Route path="/emails" element={<Emails />} />
          <Route path="/whatsapp" element={<WhatsAppDashboard />} />
          <Route path="/reports" element={<QuotationReports />} />
          <Route path="/profile" element={<UserProfileSettings />} />
        </Route>

        {/* Global redirects */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
export default App
