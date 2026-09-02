import { api } from './client'
import type { Customer } from '@/types'

export interface CustomerCreate {
  name: string
  phone?: string
  document?: string
  address?: string
  customer_type: string
  credit_limit?: number
  notes?: string
}

export interface CustomerListParams {
  search?: string
  blocked_only?: boolean
  include_inactive?: boolean
}

export async function listCustomers(params?: CustomerListParams): Promise<Customer[]> {
  const { data } = await api.get<Customer[]>('/customers', { params })
  return data
}

export async function getCustomer(id: string): Promise<Customer> {
  const { data } = await api.get<Customer>(`/customers/${id}`)
  return data
}

export async function createCustomer(body: CustomerCreate): Promise<Customer> {
  const { data } = await api.post<Customer>('/customers', body)
  return data
}

export async function updateCustomer(id: string, body: Partial<CustomerCreate> & { is_active?: boolean }): Promise<Customer> {
  const { data } = await api.patch<Customer>(`/customers/${id}`, body)
  return data
}
