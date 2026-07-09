import React, { useEffect, useState } from 'react'
import { useWorkspaceStore } from '../store/workspaceStore'
import { User, Phone, Mail, Key, ShieldAlert, Loader2, CheckCircle } from 'lucide-react'

export default function UserProfileSettings() {
  const { userProfile, fetchProfile, updateProfile, changePassword, error } = useWorkspaceStore()
  
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusType, setStatusType] = useState<'success' | 'error'>('success')

  useEffect(() => {
    fetchProfile().then((profile) => {
      if (profile) {
        setName(profile.name || '')
        setPhone(profile.phone_number || '')
      }
    }).catch(console.error)
  }, [fetchProfile])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setStatusMessage(null)
    try {
      await updateProfile({ name, phone_number: phone })
      setStatusType('success')
      setStatusMessage('Profile details updated successfully.')
    } catch (err: any) {
      setStatusType('error')
      setStatusMessage(err.message || 'Failed to update profile.')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setStatusType('error')
      setStatusMessage('Passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setStatusType('error')
      setStatusMessage('Password must be at least 8 characters long.')
      return
    }
    setLoading(true)
    setStatusMessage(null)
    try {
      await changePassword(newPassword)
      setNewPassword('')
      setConfirmPassword('')
      setStatusType('success')
      setStatusMessage('Password changed successfully.')
    } catch (err: any) {
      setStatusType('error')
      setStatusMessage(err.message || 'Failed to change password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-slate-950 text-slate-100">
      <div className="max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <User className="h-8 w-8 text-indigo-400" />
            Profile Settings
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your personal profile details, account options, and security credentials.
          </p>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className={`p-4 mb-6 rounded-lg flex items-center gap-3 text-sm border ${
            statusType === 'error'
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
            {statusType === 'error' ? (
              <ShieldAlert className="h-5 w-5 shrink-0" />
            ) : (
              <CheckCircle className="h-5 w-5 shrink-0" />
            )}
            <p>{statusMessage}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Panel: Profile Info */}
          <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 glass-card">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Mail className="h-5 w-5 text-indigo-400" />
              Account Information
            </h2>
            
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Connected Email</label>
                <div className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-4 py-2.5 text-sm text-slate-500 flex items-center gap-2 cursor-not-allowed">
                  <Mail className="h-4 w-4 text-slate-600" />
                  {userProfile?.email || 'Loading...'}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Your registered email address cannot be changed.</p>
              </div>

              {userProfile?.gmail_email && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Assigned Lead Email</label>
                  <div className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-4 py-2.5 text-sm text-slate-300 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-indigo-400" />
                    {userProfile.gmail_email}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Incoming client emails are fetched from this mailbox.</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Full Name</label>
                <div className="relative">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-slate-950 border border-slate-800/80 focus:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none transition-all"
                  />
                  <User className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Phone Number</label>
                <div className="relative">
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter phone number"
                    className="w-full bg-slate-950 border border-slate-800/80 focus:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none transition-all"
                  />
                  <Phone className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg hover:shadow-indigo-500/20"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Personal Details
              </button>
            </form>
          </div>

          {/* Right Panel: Password Change */}
          <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 glass-card">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Key className="h-5 w-5 text-emerald-400" />
              Update Password
            </h2>
            
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">New Password</label>
                <div className="relative">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full bg-slate-950 border border-slate-800/80 focus:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none transition-all"
                  />
                  <Key className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Confirm New Password</label>
                <div className="relative">
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Verify new password"
                    className="w-full bg-slate-950 border border-slate-800/80 focus:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none transition-all"
                  />
                  <Key className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg hover:shadow-emerald-500/20"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Change Password Securely
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
