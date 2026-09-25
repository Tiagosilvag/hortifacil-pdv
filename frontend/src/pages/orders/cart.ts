import { roundKg } from '@/hardware/scale/reading'
import type { Product } from '@/types'

export interface CartLine {
  product: Product
  qty: number
}

/**
 * Acrescenta `amount` ao carrinho. Produto já presente soma a quantidade (duas sacolas do mesmo produto);
 * a soma é arredondada a gramas para não acumular erro de ponto flutuante (0,1 + 0,2 = 0,3).
 */
export function addItem<T extends CartLine>(cart: T[], product: Product, amount = 1): CartLine[] {
  const existing = cart.find((line) => line.product.id === product.id)
  if (existing) {
    return cart.map((line) => (line.product.id === product.id ? { ...line, qty: roundKg(line.qty + amount) } : line))
  }
  return [...cart, { product, qty: amount }]
}

/** Muda a quantidade de um item por `delta` (botões + e -). Arredonda a gramas e remove o item quando chega a zero. */
export function changeQty<T extends CartLine>(cart: T[], productId: string, delta: number): T[] {
  return cart
    .map((line) => (line.product.id === productId ? { ...line, qty: roundKg(line.qty + delta) } : line))
    .filter((line) => line.qty > 0)
}
