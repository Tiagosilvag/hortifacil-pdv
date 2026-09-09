import { api } from './client'
import type { Category } from '@/types'

export async function listCategories(active_only = false): Promise<Category[]> {
  const { data } = await api.get<Category[]>('/categories', { params: { active_only } })
  return data
}

export async function createCategory(name: string): Promise<Category> {
  const { data } = await api.post<Category>('/categories', { name })
  return data
}

export async function toggleCategory(id: string): Promise<Category> {
  const { data } = await api.patch<Category>(`/categories/${id}/toggle`)
  return data
}

export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/categories/${id}`)
}
