import { api } from './client'
import type { ModuleKey, User } from '@/types'

export interface UserCreate {
  name: string
  email: string
  password: string
  role: 'admin' | 'operator'
  allowed_modules: ModuleKey[] | null
  can_create_products?: boolean
  can_edit_products?: boolean
}

export interface UserUpdate {
  name?: string
  role?: 'admin' | 'operator'
  is_active?: boolean
  allowed_modules?: ModuleKey[] | null
  can_create_products?: boolean
  can_edit_products?: boolean
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

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`)
}
