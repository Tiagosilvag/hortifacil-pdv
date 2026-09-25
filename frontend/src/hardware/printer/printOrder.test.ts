import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Order } from '@/types'
import { printOrderReceipt, printTestPage, type PrinterSettings } from './printOrder'

const settings: PrinterSettings = { storeName: 'LOJA', address: '', phone: '', footer: '', paperWidthMm: 80 }

const order = {
  id: 'o1', order_number: 1, customer_id: null, customer: null, total: 1, discount: 0, payment_type: 'cash',
  payment_splits: null, status: 'delivered', notes: null, invoice_number: null, invoice_series: null,
  invoice_key: null, created_by_name: 'Admin', created_at: '2026-09-25T15:30:00Z', items: [],
} as unknown as Order

describe('falha ao imprimir', () => {
  afterEach(() => vi.restoreAllMocks())

  it('nunca lança: o pedido já está salvo e a impressão não pode derrubar o PDV (aqui não existe `document`, então imprimir falha)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(typeof document).toBe('undefined') // o ambiente de teste não tem DOM
    expect(() => printOrderReceipt(order, settings)).not.toThrow()
    expect(() => printTestPage(settings)).not.toThrow()
    expect(error).toHaveBeenCalledTimes(2)
  })
})
