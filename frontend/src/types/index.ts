export type UserRole = 'admin' | 'operator'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  is_active: boolean
  created_at: string
  last_login: string | null
}

export type CustomerType = 'counter' | 'external' | 'hotel' | 'inn' | 'wholesale'

export interface Customer {
  id: string
  name: string
  phone: string | null
  customer_type: CustomerType
  credit_limit: number
  balance_due: number
  is_blocked: boolean
  is_active: boolean
  notes: string | null
  created_at: string
}

export type UnitType = 'unit' | 'kg' | 'gram' | 'liter' | 'box' | 'bunch'

export interface Product {
  id: string
  name: string
  barcode: string | null
  unit_type: UnitType
  price: number
  category: string | null
  is_active: boolean
  created_at: string
}

export type PaymentType = 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'installment'
export type OrderStatus = 'pending' | 'delivered' | 'cancelled'

export interface OrderItem {
  id: string
  product_id: string
  product_name: string
  unit_type: string
  qty: number
  unit_price: number
  subtotal: number
}

export interface Order {
  id: string
  order_number: number
  customer_id: string | null
  customer: Customer | null
  total: number
  discount: number
  payment_type: PaymentType
  status: OrderStatus
  notes: string | null
  created_by_name: string
  created_at: string
  items: OrderItem[]
}

export type ReceivableStatus = 'open' | 'partial' | 'paid' | 'overdue'

export interface Receivable {
  id: string
  customer_id: string
  customer: Customer
  order_id: string | null
  order_number: number | null
  amount: number
  amount_paid: number
  status: ReceivableStatus
  due_date: string | null
  paid_at: string | null
  paid_by_name: string | null
  created_at: string
}

export interface DashboardData {
  today_sales_total: number
  today_sales_count: number
  open_receivables_total: number
  open_receivables_count: number
  blocked_customers_count: number
  overdue_receivables_count: number
  last_7_days_total: number
}
