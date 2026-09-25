import { describe, expect, it } from 'vitest'
import type { Product } from '@/types'
import { addItem, type CartLine } from './cart'

const product = (id: string, unit_type: Product['unit_type'] = 'kg'): Product =>
  ({ id, code: 1, name: `Produto ${id}`, barcode: null, unit_type, price: 10, category: null, stock: 0,
    expiry_date: null, is_active: true, created_at: '', has_orders: false })

describe('addItem', () => {
  it('produto novo entra com a quantidade informada', () => {
    const cart = addItem([], product('a'), 1.235)
    expect(cart).toEqual([{ product: product('a'), qty: 1.235 }])
  })

  it('sem quantidade informada, entra 1 (comportamento de sempre, sem balança)', () => {
    expect(addItem([], product('a', 'unit'))[0].qty).toBe(1)
  })

  it('mesmo produto de novo soma o peso (duas sacolas)', () => {
    const first = addItem([], product('a'), 1.235)
    const second = addItem(first, product('a'), 0.5)
    expect(second).toHaveLength(1)
    expect(second[0].qty).toBe(1.735)
  })

  it('a soma não acumula erro de ponto flutuante', () => {
    const cart = addItem(addItem([], product('a'), 0.1), product('a'), 0.2)
    expect(cart[0].qty).toBe(0.3)
  })

  it('não altera o carrinho original nem os outros itens', () => {
    const original: CartLine[] = [{ product: product('a'), qty: 1 }, { product: product('b'), qty: 2 }]
    const snapshot = JSON.parse(JSON.stringify(original))
    const next = addItem(original, product('a'), 1)
    expect(original).toEqual(snapshot)
    expect(next[1]).toBe(original[1])
  })
})
