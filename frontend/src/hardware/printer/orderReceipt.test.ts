import { describe, expect, it } from 'vitest'
import type { Order, OrderItem } from '@/types'
import { formatCurrency, formatDate } from '@/utils/format'
import { buildOrderReceipt, buildTestReceipt, formatQty, type ReceiptConfig } from './orderReceipt'
import type { Receipt } from './receipt'

const config: ReceiptConfig = {
  storeName: 'GALEGO HORTIFRUTI',
  address: 'Rua Exemplo, 100 - Centro',
  phone: '(81) 3333-4444',
  footer: 'Obrigado! Volte sempre.',
}

const item = (overrides: Partial<OrderItem> = {}): OrderItem => ({
  id: 'i1', product_id: 'p1', product_name: 'BANANA PRATA KG', product_code: 21, barcode: null,
  unit_type: 'kg', qty: 1.235, unit_price: 6.99, subtotal: 8.63, ...overrides,
})

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'o1', order_number: 42, customer_id: null, customer: null, total: 8.63, discount: 0,
  payment_type: 'cash', payment_splits: null, status: 'delivered', notes: null,
  invoice_number: null, invoice_series: null, invoice_key: null,
  created_by_name: 'Admin', created_at: '2026-09-25T15:30:00Z', items: [item()], ...overrides,
})

/** Uma linha de texto por bloco, para conferir o conteúdo sem depender do HTML. */
const lines = (receipt: Receipt): string[] =>
  receipt.blocks.flatMap((b) => {
    if (b.type === 'text') return [b.text]
    if (b.type === 'row') return [`${b.left} | ${b.right}`]
    return []
  })

describe('formatQty', () => {
  it('kg sempre com 3 casas; inteiros sem casas; fracionados sem zeros à direita', () => {
    expect(formatQty(1.235, 'kg')).toBe('1,235')
    expect(formatQty(2, 'kg')).toBe('2,000')
    expect(formatQty(3, 'unit')).toBe('3')
    expect(formatQty(2.5, 'unit')).toBe('2,5')
  })
})

describe('buildOrderReceipt', () => {
  it('cabeçalho do comércio centralizado, seguido de "CUPOM NÃO FISCAL"', () => {
    const { blocks } = buildOrderReceipt(order(), config)
    expect(blocks[0]).toEqual({ type: 'text', text: 'GALEGO HORTIFRUTI', align: 'center', bold: true, size: 'large' })
    expect(lines(buildOrderReceipt(order(), config)).slice(0, 4)).toEqual([
      'GALEGO HORTIFRUTI', 'Rua Exemplo, 100 - Centro', '(81) 3333-4444', 'CUPOM NÃO FISCAL',
    ])
    expect(blocks.find((b) => b.type === 'text' && b.text === 'CUPOM NÃO FISCAL')).toMatchObject({ align: 'center', bold: true })
  })

  it('cabeçalho vazio não deixa linhas em branco no topo', () => {
    const empty = { storeName: '', address: '  ', phone: '', footer: '' }
    expect(buildOrderReceipt(order(), empty).blocks[0]).toMatchObject({ type: 'text', text: 'CUPOM NÃO FISCAL' })
  })

  it('pedido, data, operador e cliente (só quando há cliente)', () => {
    const without = lines(buildOrderReceipt(order(), config))
    expect(without).toContain('Pedido nº | 42')
    expect(without).toContain(`Data | ${formatDate('2026-09-25T15:30:00Z')}`)
    expect(without).toContain('Operador | Admin')
    expect(without.some((l) => l.startsWith('Cliente'))).toBe(false)

    const customer = { id: 'c1', name: 'MARIA SILVA', is_blocked: false, balance_due: 0 } as unknown as Order['customer']
    expect(lines(buildOrderReceipt(order({ customer }), config))).toContain('Cliente | MARIA SILVA')
  })

  it('item: código e nome em uma linha, e "quantidade x preço" com o total na outra', () => {
    const out = lines(buildOrderReceipt(order(), config))
    expect(out).toContain('021 BANANA PRATA KG')
    expect(out).toContain(`1,235 kg x ${formatCurrency(6.99)} | ${formatCurrency(8.63)}`)
  })

  it('item sem código de produto (pedidos antigos) sai só com o nome; unidade não é kg', () => {
    const out = lines(buildOrderReceipt(order({ items: [item({ product_code: null, product_name: 'OVOS', unit_type: 'unit', qty: 3, unit_price: 12, subtotal: 36 })], total: 36 }), config))
    expect(out).toContain('OVOS')
    expect(out).toContain(`3 un x ${formatCurrency(12)} | ${formatCurrency(36)}`)
  })

  it('valores que chegam como texto da API (Decimal) viram número', () => {
    const asText = item({ qty: '1.235' as unknown as number, unit_price: '6.99' as unknown as number, subtotal: '8.63' as unknown as number })
    const out = lines(buildOrderReceipt(order({ items: [asText], total: '8.63' as unknown as number }), config))
    expect(out).toContain(`1,235 kg x ${formatCurrency(6.99)} | ${formatCurrency(8.63)}`)
    expect(out).toContain(`TOTAL | ${formatCurrency(8.63)}`)
  })

  it('desconto: mostra subtotal e desconto; sem desconto, só o TOTAL', () => {
    const noDiscount = lines(buildOrderReceipt(order(), config))
    expect(noDiscount.some((l) => l.startsWith('Subtotal') || l.startsWith('Desconto'))).toBe(false)

    const withDiscount = lines(buildOrderReceipt(order({ discount: 3, total: 5.63 }), config))
    expect(withDiscount).toContain(`Subtotal | ${formatCurrency(8.63)}`)
    expect(withDiscount).toContain(`Desconto | -${formatCurrency(3)}`)
    expect(withDiscount).toContain(`TOTAL | ${formatCurrency(5.63)}`)
  })

  it('TOTAL em negrito', () => {
    const total = buildOrderReceipt(order(), config).blocks.find((b) => b.type === 'row' && b.left === 'TOTAL')
    expect(total).toMatchObject({ bold: true })
  })

  it('pagamento único usa a forma do pedido; pagamento dividido lista cada parte', () => {
    expect(lines(buildOrderReceipt(order({ payment_type: 'pix' }), config))).toContain(`Pix | ${formatCurrency(8.63)}`)

    const split = order({
      payment_type: 'mixed', total: 30,
      payment_splits: [{ type: 'cash', amount: 20 }, { type: 'pix', amount: '10.00' as unknown as number }],
    })
    const out = lines(buildOrderReceipt(split, config))
    expect(out).toContain(`Dinheiro | ${formatCurrency(20)}`)
    expect(out).toContain(`Pix | ${formatCurrency(10)}`)
  })

  it('pedido cancelado sai com CANCELADO antes de "CUPOM NÃO FISCAL"', () => {
    const out = lines(buildOrderReceipt(order({ status: 'cancelled' }), config))
    expect(out.indexOf('*** CANCELADO ***')).toBeGreaterThan(-1)
    expect(out.indexOf('*** CANCELADO ***')).toBeLessThan(out.indexOf('CUPOM NÃO FISCAL'))
    expect(lines(buildOrderReceipt(order(), config))).not.toContain('*** CANCELADO ***')
  })

  it('observação só aparece quando existe', () => {
    expect(lines(buildOrderReceipt(order({ notes: 'Entregar à tarde' }), config))).toContain('Obs.: Entregar à tarde')
    expect(lines(buildOrderReceipt(order({ notes: '  ' }), config)).some((l) => l.startsWith('Obs.'))).toBe(false)
  })

  it('rodapé configurável e o cupom termina com o corte', () => {
    const { blocks } = buildOrderReceipt(order(), config)
    expect(lines({ blocks })).toContain('Obrigado! Volte sempre.')
    expect(blocks.at(-1)).toEqual({ type: 'cut' })
    expect(lines(buildOrderReceipt(order(), { ...config, footer: '' }))).not.toContain('Obrigado! Volte sempre.')
  })
})

describe('buildTestReceipt', () => {
  it('traz régua de largura, acentos e um nome longo para conferir a impressão', () => {
    const out = lines(buildTestReceipt(config, 80))
    expect(out).toContain('TESTE DE IMPRESSÃO')
    expect(out).toContain('Largura configurada: 80 mm')
    expect(out.some((l) => l.includes('ÁÉÍÓÚ') && l.includes('ãõç'))).toBe(true)
    expect(out.some((l) => l.length > 40 && /LONGO/.test(l))).toBe(true)
    expect(out.some((l) => /^(1234567890)+$/.test(l))).toBe(true)
  })

  it('a régua muda com a largura de 58 mm', () => {
    expect(lines(buildTestReceipt(config, 58))).toContain('Largura configurada: 58 mm')
  })
})
