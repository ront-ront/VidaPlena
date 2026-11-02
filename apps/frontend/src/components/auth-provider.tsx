'use client'

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import { apiClient } from '@/services/api-client'
import { type CurrentUser, currentUser } from '@/services/session'

type AuthContextValue = {
  status: 'loading' | 'authenticated' | 'anonymous'
  user: CurrentUser | null
  activateSession: (tokens: {
    accessToken: string
    expiresAt: string
  }) => Promise<CurrentUser>
  reloadUser: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading')
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    let active = true
    apiClient.setSessionLostHandler(() => {
      if (!active) return
      setUser(null)
      setStatus('anonymous')
    })
    void apiClient.refreshSession().then(async (token) => {
      if (!active) return
      if (!token) {
        setStatus('anonymous')
        return
      }
      try {
        const profile = await currentUser()
        if (active) {
          setUser(profile)
          setStatus('authenticated')
        }
      } catch {
        if (active) {
          setUser(null)
          setStatus('anonymous')
        }
      }
    })
    return () => {
      active = false
      apiClient.setSessionLostHandler(null)
    }
  }, [])

  async function activateSession(tokens: {
    accessToken: string
    expiresAt: string
  }) {
    apiClient.adoptSession(tokens)
    const profile = await currentUser()
    setUser(profile)
    setStatus('authenticated')
    return profile
  }

  async function reloadUser() {
    const profile = await currentUser()
    setUser(profile)
    setStatus('authenticated')
  }

  async function signOut() {
    await apiClient.logout()
    setUser(null)
    setStatus('anonymous')
  }

  return (
    <AuthContext.Provider
      value={{ status, user, activateSession, reloadUser, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider ausente')
  return context
}
