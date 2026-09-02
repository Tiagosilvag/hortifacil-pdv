import { api } from './client'
import type { Order } from '@/types'

export interface OrderItemCreate {
  product_id: string
  qty: number
}

export interface OrderCreate {
  customer_id?: string
  payment_type: string
  items: OrderItemCreate[]
  discount?: number
  notes?: string
}

export interface OrderListParams {
  customer_id?: string
  status?: string
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}

export async function createOrder(body: OrderCreate): Promise<Order> {
  const { data } = await api.post<Order>('/orders', body)
  return data
}

export async function listOrders(params?: OrderListParams): Promise<Order[]> {
  const { data } = await api.get<Order[]>('/orders', { params })
  return data
}

export async function getOrder(id: string): Promise<Order> {
  const { data } = await api.get<Order>(`/orders/${id}`)
  return data
}

export async function cancelOrder(id: string, reason?: string): Promise<Order> {
  const { data } = await api.post<Order>(`/orders/${id}/cancel`, { reason })
  return data
}
