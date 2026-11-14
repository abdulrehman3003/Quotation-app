import { create } from 'zustand'
import { supabase } from '../lib/supabase'

interface AuthState {
  user: any | null
  session: any | null
  loading: boolean
  initialized: boolean
  isPasswordRecovery: boolean
  initialize: () => Promise<void>
  clearPasswordRecovery: () => void
  signOut: () => Promise<void>
}

let authSubscription: { unsubscribe: () => void } | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,
  isPasswordRecovery: typeof window !== 'undefined' && window.location.hash.includes('type=recovery'),

  initialize: async () => {
    if (get().initialized) {
      return
    }
    set({ initialized: true })

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const hasRecoveryHash = typeof window !== 'undefined' && window.location.hash.includes('type=recovery')
      set({
        session,
        user: session?.user ?? null,
        loading: false,
        isPasswordRecovery: get().isPasswordRecovery || hasRecoveryHash
      })
    } catch (err) {
      console.error('Failed to fetch session:', err)
      set({ loading: false })
    }

    if (!authSubscription) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          set({ session, user: session?.user ?? null, loading: false, isPasswordRecovery: true })
          return
        }
        set({ session, user: session?.user ?? null, loading: false })
      })
      authSubscription = data.subscription
    }
  },

  clearPasswordRecovery: () => {
    set({ isPasswordRecovery: false })
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('SignOut request error:', err)
    } finally {
      set({ user: null, session: null, isPasswordRecovery: false })
      window.location.href = '/auth'
    }
  }
}))
