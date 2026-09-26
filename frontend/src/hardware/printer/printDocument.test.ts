import { describe, expect, it } from 'vitest'
import type { Order } from '@/types'
import type { FiscalPrintInfo } from './fiscalReceipt'
import { buildDocumentReceipt, type PrinterSettings } from './printOrder'

const settings: PrinterSettings = { storeName: 'LOJA', address: '', phone: '', footer: 'Volte sempre', paperWidthMm: 80 }
const fiscal: FiscalPrintInfo = {
  environment: 'producao',
  issuer: { legal_name: 'EMPRESA TESTE LTDA', cnpj: '11222333000181', ie: null, street: null, number: null, district: null, city: null, state: null, zip_code: null },
}

function order(over: Record<string, unknown> = {}): Order {
  return {
    id: 'o1', order_number: 1, customer_id: null, customer: null, total: '5.00', discount: '0', payment_type: 'cash',
    payment_splits: null, status: 'delivered', notes: null, invoice_number: '7', invoice_series: '1',
    invoice_key: '26260311222333000181650010000000071000000019', created_by_name: 'Admin', created_at: '2026-09-25T15:30:00Z',
    fiscal_status: 'authorized', fiscal_protocol: '9', fiscal_qr_url: 'https://fake.invalid/qr/1', fiscal_emitted_at: '2026-09-25T15:30:05Z',
    items: [{ id: 'i1', product_id: 'p1', product_name: 'OVOS', product_code: 5, unit_type: 'unit', qty: '1', unit_price: '5.00', subtotal: '5.00' }],
    ...over,
  } as unknown as Order
}

const texts = (o: Order, info: FiscalPrintInfo | null) =>
  buildDocumentReceipt(o, settings, info).blocks.flatMap((b) => (b.type === 'text' ? [b.text] : []))

describe('qual cupom sai para o pedido', () => {
  it('nota autorizada e dados da empresa: cupom fiscal, com o rodapé da configuração', () => {
    const text = texts(order(), fiscal)
    expect(text).toContain('DANFE NFC-e')
    expect(text).toContain('Volte sempre')
    expect(text).not.toContain('CUPOM NÃO FISCAL')
  })

  it('nota autorizada mas sem os dados da empresa: cai no cupom não fiscal, nunca num cupom fiscal incompleto', () => {
    expect(texts(order(), null)).toContain('CUPOM NÃO FISCAL')
  })

  it('qualquer outro estado da nota sai como cupom não fiscal', () => {
    for (const fiscal_status of ['not_required', 'pending', 'rejected', undefined]) {
      expect(texts(order({ fiscal_status }), fiscal)).toContain('CUPOM NÃO FISCAL')
    }
  })
})
