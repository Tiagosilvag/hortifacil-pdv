import { api } from './client'

export interface PaymentBreakdown {
  payment_type: string
  total: number
  count: number
}

export interface DayBreakdown {
  day: string
  total: number
  count: number
}

export interface SalesReport {
  date_from: string
  date_to: string
  total: number
  count: number
  avg_ticket: number
  cancelled_count: number
  by_payment: PaymentBreakdown[]
  by_day: DayBreakdown[]
}

export async function getSalesReport(date_from: string, date_to: string): Promise<SalesReport> {
  const { data } = await api.get<SalesReport>('/reports/sales', { params: { date_from, date_to } })
  return data
}
