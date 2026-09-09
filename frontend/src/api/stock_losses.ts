import { api } from './client'
import type { StockLoss } from '@/types'

export interface StockLossCreate {
  product_id: string
  qty: number
  reason?: string
}

export async function listStockLosses(params?: { limit?: number; offset?: number }): Promise<StockLoss[]> {
  const { data } = await api.get<StockLoss[]>('/stock-losses', { params })
  return data
}

export async function createStockLoss(body: StockLossCreate): Promise<StockLoss> {
  const { data } = await api.post<StockLoss>('/stock-losses', body)
  return data
}
