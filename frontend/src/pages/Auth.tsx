import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { Lock, Mail, KeyRound, AlertTriangle, ArrowRight } from 'lucide-react'

export const Auth: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const navigate = useNavigate()
  const { session } = useAuthStore()

  // Redirect if session is already present
  useEffect(() => {
    if (session) {
      navigate('/dashboard')
    }
  }, [session, navigate])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!email || !password) {
      setErrorMsg('Please enter both email and password.')
      return
    }

    if (isSignUp) {
      // Security Guideline check: Validate strong user password
      if (password.length < 8) {
        setErrorMsg('Password must be at least 8 characters long.')
        return
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match.')
        return
      }
    }

    setLoading(true)
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error
        setSuccessMsg('Registration successful! Please check your email for confirmation.')
        // Auto toggle back to login after signup success
        setIsSignUp(false)
        setPassword('')
        setConfirmPassword('')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        navigate('/dashboard')
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
      <div className="w-full max-w-md p-8 rounded-2xl glass-panel glow-border border border-slate-800 flex flex-col gap-6">
        
        {/* Header Branding */}
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center mx-auto mb-3 shadow-glow-md">
            <span className="text-white font-extrabold font-outfit text-2xl">A</span>
          </div>
          <h1 className="text-2xl font-extrabold font-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-brand-400">
            Welcome to AXRFLOWS
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isSignUp ? 'Create your platform account' : 'Sign in to access your dashboard'}
          </p>
        </div>

        {/* Toggle tabs */}
        <div className="flex bg-slate-900/60 p-1 rounded-lg border border-slate-800/80">
          <button
            type="button"
            onClick={() => { setIsSignUp(false); setErrorMsg(null); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
              !isSignUp ? 'bg-brand-500 text-white shadow-glow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => { setIsSignUp(true); setErrorMsg(null); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
              isSignUp ? 'bg-brand-500 text-white shadow-glow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-slate-100 placeholder-slate-600 rounded-lg pl-10 pr-4 py-3 text-sm outline-none transition-all"
                placeholder="you@company.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-slate-100 placeholder-slate-600 rounded-lg pl-10 pr-4 py-3 text-sm outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          {isSignUp && (
            <div className="animate-fadeIn">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-slate-100 placeholder-slate-600 rounded-lg pl-10 pr-4 py-3 text-sm outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}

          {/* Feedback alerts */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fadeIn">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm animate-fadeIn">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium py-3 rounded-lg hover:shadow-glow-md disabled:bg-brand-500/50 disabled:cursor-not-allowed transition-all duration-200 text-sm"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <>
                {isSignUp ? 'Register Account' : 'Authenticate Credentials'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
