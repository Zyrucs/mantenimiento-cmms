import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Role = 'JEFE' | 'TECNICO'

export interface Profile {
  id: string
  full_name: string
  role: Role
  technician_id: number | null
}

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role, technician_id')
    .eq('id', userId)
    .maybeSingle()
  return (data as Profile | null) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    let active = true
    const apply = async (s: Session | null) => {
      const p = s ? await fetchProfile(s.user.id) : null
      if (!active) return
      setSession(s)
      setProfile(p)
      setLoading(false)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // Defer so we never call Supabase inside its own auth callback.
      setTimeout(() => apply(s), 0)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return 'Correo o contraseña incorrectos.'
    const p = await fetchProfile(data.user.id)
    if (!p) {
      await supabase.auth.signOut()
      return 'Tu cuenta no tiene un perfil asignado. Pide al Jefe de Mantenimiento que lo cree.'
    }
    return null
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ loading, session, profile, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export function homePathFor(role: Role) {
  return role === 'JEFE' ? '/dashboard' : '/ordenes'
}
