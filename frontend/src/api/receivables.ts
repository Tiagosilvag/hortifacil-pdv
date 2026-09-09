import { api } from './client'
import type { Receivable } from '@/types'

export interface ReceivableListParams {
  customer_id?: string
  status?: string
}

export interface BulkPayResult {
  total_paid: number
  receivables_updated: number
  customer_balance_due: number
}

export async function listReceivables(params?: ReceivableListParams): Promise<Receivable[]> {
  const { data } = await api.get<Receivable[]>('/receivables', { params })
  return data
}

export async function registerPayment(
  id: string,
  amount: number,
  paid_by_name?: string
): Promise<Receivable> {
  const { data } = await api.post<Receivable>(`/receivables/${id}/pay`, {
    amount,
    paid_by_name,
  })
  return data
}

export async function bulkPayReceivables(
  customer_id: string,
  amount: number
): Promise<BulkPayResult> {
  const { data } = await api.post<BulkPayResult>('/receivables/bulk-pay', {
    customer_id,
    amount,
  })
  return data
}
