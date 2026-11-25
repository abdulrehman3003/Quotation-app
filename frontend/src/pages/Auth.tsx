import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { useWorkspaceStore } from '../store/workspaceStore'
import {
  Lock,
  Mail,
  KeyRound,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  User,
  Building2,
  ArrowLeft,
  Users
} from 'lucide-react'

type AuthMode = 'login' | 'register' | 'forgot' | 'recovery'

const INVITE_STORAGE_KEY = 'axrflows_invite_token'

function formatAuthError(rawMessage: string | undefined): string {
  if (!rawMessage) return 'Authentication failed. Please try again.'
  const lower = rawMessage.toLowerCase()
  if (
    lower.includes('already registered') ||
    lower.includes('already been registered') ||
    lower.includes('already exists') ||
    lower.includes('duplicate key') ||
    lower.includes('23505') ||
    lower.includes('email_exists') ||
    lower.includes('database error saving new user')
  ) {
    return 'An account with this email address already exists. Please sign in or reset your password.'
  }
  if (lower.includes('invalid login credentials')) {
    return 'Invalid email or password. Please verify your credentials and try again.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Your email address has not been confirmed yet. Please check your inbox for the verification link.'
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment before trying again.'
  }
  return rawMessage
}

export const Auth: React.FC = () => {
  const [searchParams] = useSearchParams()
  const urlInviteToken = searchParams.get('invite')

  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    return urlInviteToken || sessionStorage.getItem(INVITE_STORAGE_KEY)
  })
  const [inviteInfo, setInviteInfo] = useState<{
    company_id: string
    company_name: string
    invited_by_name: string
  } | null>(null)

  const [mode, setMode] = useState<AuthMode>(() => (urlInviteToken ? 'register' : 'login'))
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('session') === 'expired'
      ? 'Your session is no longer valid. Please sign in again.'
      : null
  )
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const navigate = useNavigate()
  const { session, isPasswordRecovery, clearPasswordRecovery } = useAuthStore()
  const { fetchProfile, verifyInviteToken, acceptTeamInvite } = useWorkspaceStore()

  useEffect(() => {
    if (urlInviteToken) {
      sessionStorage.setItem(INVITE_STORAGE_KEY, urlInviteToken)
      setInviteToken(urlInviteToken)
    }
  }, [urlInviteToken])

  useEffect(() => {
    if (!inviteToken) return
    let active = true
    verifyInviteToken(inviteToken)
      .then((info) => {
        if (!active) return
        if (info?.valid) {
          setInviteInfo({
            company_id: info.company_id,
            company_name: info.company_name,
            invited_by_name: info.invited_by_name
          })
          setCompanyName(info.company_name || '')
        }
      })
      .catch((err) => {
        if (!active) return
        sessionStorage.removeItem(INVITE_STORAGE_KEY)
        setInviteToken(null)
        setInviteInfo(null)
        setErrorMsg(err.message || 'This team invitation link is invalid or has expired.')
      })
    return () => {
      active = false
    }
  }, [inviteToken, verifyInviteToken])

  useEffect(() => {
    if (isPasswordRecovery) {
      setMode('recovery')
    }
  }, [isPasswordRecovery])

  // Redirect authenticated users to onboarding (if incomplete) or dashboard
  useEffect(() => {
    if (!session || isPasswordRecovery || mode === 'recovery') return

    let cancelled = false
    const finalizeSession = async () => {
      try {
        if (inviteToken) {
          await acceptTeamInvite(inviteToken, fullName.trim() || undefined)
          sessionStorage.removeItem(INVITE_STORAGE_KEY)
          if (!cancelled) {
            navigate('/dashboard', { replace: true })
          }
          return
        }

        const profile = await fetchProfile()
        if (cancelled) return
        if (profile && !profile.onboarding_completed && profile.role !== 'admin') {
          navigate('/onboarding', { replace: true })
        } else {
          navigate('/dashboard', { replace: true })
        }
      } catch {
        if (!cancelled) {
          navigate('/dashboard', { replace: true })
        }
      }
    }

    finalizeSession()

    return () => {
      cancelled = true
    }
  }, [session, isPasswordRecovery, mode, inviteToken, fullName, acceptTeamInvite, fetchProfile, navigate])

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setErrorMsg(null)
    setSuccessMsg(null)
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)

    const cleanEmail = email.trim().toLowerCase()

    if (mode === 'forgot') {
      if (!cleanEmail) {
        setErrorMsg('Please enter your registered email address.')
        return
      }
      setLoading(true)
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/auth`
        })
        if (error) throw error
        setSuccessMsg('Password reset instructions have been sent to your email inbox.')
      } catch (err: any) {
        setErrorMsg(formatAuthError(err.message))
      } finally {
        setLoading(false)
      }
      return
    }

    if (mode === 'recovery') {
      if (password.length < 8) {
        setErrorMsg('Password must be at least 8 characters long.')
        return
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match.')
        return
      }
      setLoading(true)
      try {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        clearPasswordRecovery()
        setSuccessMsg('Your password has been updated! Redirecting to your workspace...')
        setTimeout(() => navigate('/dashboard', { replace: true }), 1000)
      } catch (err: any) {
        setErrorMsg(formatAuthError(err.message))
      } finally {
        setLoading(false)
      }
      return
    }

    if (!cleanEmail || !password) {
      setErrorMsg('Please enter both your email address and password.')
      return
    }

    if (mode === 'register') {
      if (!fullName.trim()) {
        setErrorMsg('Please enter your full name.')
        return
      }
      if (!inviteInfo && !companyName.trim()) {
        setErrorMsg('Please enter your company or workspace name.')
        return
      }
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
      if (mode === 'register') {
        const signUpMeta: Record<string, string> = {
          full_name: fullName.trim(),
          company_name: inviteInfo ? inviteInfo.company_name : companyName.trim()
        }
        if (inviteInfo?.company_id) {
          signUpMeta.company_id = inviteInfo.company_id
        }

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: signUpMeta
          }
        })

        if (error) throw error

        // Supabase returns an empty identities array when the email is already registered
        // and email confirmation is enabled
        if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setErrorMsg(
            inviteInfo
              ? 'An account with this email already exists. Switch to the Login tab above to sign in and join the team.'
              : 'An account with this email address already exists. Please sign in or reset your password.'
          )
          return
        }

        if (data?.session) {
          if (inviteToken) {
            try {
              await acceptTeamInvite(inviteToken, fullName.trim())
              sessionStorage.removeItem(INVITE_STORAGE_KEY)
            } catch (inviteErr) {
              console.error('Failed to finalize team invite:', inviteErr)
            }
            navigate('/dashboard', { replace: true })
            return
          }
          navigate('/onboarding', { replace: true })
          return
        }

        setSuccessMsg(
          inviteInfo
            ? `Account created! Please check your email inbox to confirm your address, then sign in to join ${inviteInfo.company_name}.`
            : 'Registration successful! Please check your email inbox to confirm your account, then sign in to complete setup.'
        )
        setMode('login')
        setPassword('')
        setConfirmPassword('')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        })
        if (error) throw error

        if (inviteToken) {
          try {
            await acceptTeamInvite(inviteToken, fullName.trim() || undefined)
            sessionStorage.removeItem(INVITE_STORAGE_KEY)
          } catch (inviteErr) {
            console.error('Failed to accept team invite after sign-in:', inviteErr)
          }
          navigate('/dashboard', { replace: true })
          return
        }

        try {
          const profile = await fetchProfile()
          if (profile && !profile.onboarding_completed && profile.role !== 'admin') {
            navigate('/onboarding', { replace: true })
          } else {
            navigate('/dashboard', { replace: true })
          }
        } catch {
          navigate('/dashboard', { replace: true })
        }
      }
    } catch (err: any) {
      setErrorMsg(formatAuthError(err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
      <div className="w-full max-w-md p-8 rounded-lg glass-panel border border-slate-800 flex flex-col gap-6">
        {/* Header Branding */}
        <div className="text-center">
          <div className="w-12 h-12 rounded-lg bg-brand-500 flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-semibold text-2xl">A</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-brand-400">
            {inviteInfo ? `Join ${inviteInfo.company_name}` : 'Welcome to AXRFLOWS'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {inviteInfo
              ? `Sign in or create an account with your email to access ${inviteInfo.company_name}'s quotations`
              : mode === 'register'
              ? 'Create your isolated company workspace'
              : mode === 'forgot'
              ? 'Reset your account password'
              : mode === 'recovery'
              ? 'Choose a new password for your account'
              : 'Sign in to access your quotation workspace'}
          </p>
        </div>

        {/* Team Invitation Banner */}
        {inviteInfo && (
          <div className="p-3.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="text-xs text-slate-300 leading-relaxed">
              <span className="font-semibold text-white">{inviteInfo.invited_by_name}</span> invited you to collaborate in{' '}
              <span className="font-semibold text-indigo-300">{inviteInfo.company_name}</span>. Sign in or register below to view your company&apos;s leads and quotations.
            </div>
          </div>
        )}

        {/* Toggle tabs for Login / Register */}
        {(mode === 'login' || mode === 'register') && (
          <div className="flex bg-slate-900/60 p-1 rounded-lg border border-slate-800/80">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                mode === 'login' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                mode === 'register' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Register
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="label">
                  Full Name (Shown on Quotations Attended)
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-slate-100 placeholder-slate-600 rounded-lg pl-10 pr-4 py-3 text-sm outline-none transition-colors"
                    placeholder="Jane Doe"
                  />
                </div>
              </div>

              <div>
                <label className="label">
                  Company / Workspace Name
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    readOnly={Boolean(inviteInfo)}
                    value={inviteInfo ? inviteInfo.company_name : companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className={`w-full bg-slate-900 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-slate-100 placeholder-slate-600 rounded-lg pl-10 pr-4 py-3 text-sm outline-none transition-colors ${
                      inviteInfo ? 'opacity-75 cursor-not-allowed text-indigo-300 font-semibold' : ''
                    }`}
                    placeholder="Apex Fabrication Inc."
                  />
                </div>
              </div>
            </>
          )}

          {mode !== 'recovery' && (
            <div>
              <label className="label">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-slate-100 placeholder-slate-600 rounded-lg pl-10 pr-4 py-3 text-sm outline-none transition-colors"
                  placeholder="you@company.com"
                />
              </div>
            </div>
          )}

          {mode !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label">
                  {mode === 'recovery' ? 'New Password' : 'Password'}
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-brand-400 hover:text-brand-300 font-medium cursor-pointer transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-slate-100 placeholder-slate-600 rounded-lg pl-10 pr-4 py-3 text-sm outline-none transition-colors"
                  placeholder="Minimum 8 characters"
                />
              </div>
            </div>
          )}

          {(mode === 'register' || mode === 'recovery') && (
            <div className="animate-fadeIn">
              <label className="label">
                Confirm Password
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-slate-100 placeholder-slate-600 rounded-lg pl-10 pr-4 py-3 text-sm outline-none transition-colors"
                  placeholder="Re-enter password"
                />
              </div>
            </div>
          )}

          {/* Feedback alerts */}
          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fadeIn">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm animate-fadeIn">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium py-3 rounded-lg disabled:bg-brand-500/50 disabled:cursor-not-allowed transition-colors text-sm cursor-pointer"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <>
                {mode === 'register'
                  ? 'Create Workspace Account'
                  : mode === 'forgot'
                  ? 'Send Reset Link'
                  : mode === 'recovery'
                  ? 'Update Password'
                  : 'Sign In to Workspace'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {(mode === 'forgot' || mode === 'recovery') && (
            <button
              type="button"
              onClick={() => {
                clearPasswordRecovery()
                switchMode('login')
              }}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Sign In
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
export default Auth
