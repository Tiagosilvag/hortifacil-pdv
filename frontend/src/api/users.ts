import { api } from './client'
import type { ModuleKey, User } from '@/types'

export interface UserCreate {
  name: string
  email: string
  password: string
  role: 'admin' | 'operator'
  allowed_modules: ModuleKey[] | null
}

export interface UserUpdate {
  name?: string
  role?: 'admin' | 'operator'
  is_active?: boolean
  allowed_modules?: ModuleKey[] | null
  password?: string
}

export async function listUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>('/users')
  return data
}

export async function createUser(body: UserCreate): Promise<User> {
  const { data } = await api.post<User>('/users', body)
  return data
}

export async function updateUser(id: string, body: UserUpdate): Promise<User> {
  const { data } = await api.patch<User>(`/users/${id}`, body)
  return data
}
