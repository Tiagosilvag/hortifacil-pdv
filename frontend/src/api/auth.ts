import { api } from './client'
import type { User } from '@/types'

export interface LoginResponse {
  access_token: string
  token_type: string
  user: import('@/types').User
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const params = new URLSearchParams()
  params.append('username', email)
  params.append('password', password)
  const { data } = await api.post<LoginResponse>('/auth/login', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>('/auth/me')
  return data
}
