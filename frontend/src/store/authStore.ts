import { create } from 'zustand'
import { supabase } from '../lib/supabase'

interface AuthState {
  user: any | null
  session: any | null
  loading: boolean
  initialize: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      set({ session, user: session?.user ?? null, loading: false })
    } catch (err) {
      console.error("Failed to fetch session:", err)
      set({ loading: false })
    }

    // Subscribe to auth state updates
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null, loading: false })
    })
  },
  signOut: async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error("SignOut request error:", err)
    } finally {
      // Clear memory state
      set({ user: null, session: null })
      
      // Enforce Storage & Session Security Guideline:
      // Hard redirect to auth page to completely clear JS context memory and caching state.
      window.location.href = '/auth'
    }
  }
}))
