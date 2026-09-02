import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ModuleKey, User } from '@/types'

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  logout: () => void
  canAccess: (module: ModuleKey) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      canAccess: (module) => {
        const { user } = get()
        if (!user) return false
        if (user.role === 'admin') return true
        if (!user.allowed_modules) return true // operator sem restrição = acesso total
        return user.allowed_modules.includes(module)
      },
    }),
    { name: 'hortifacil-auth' }
  )
)
