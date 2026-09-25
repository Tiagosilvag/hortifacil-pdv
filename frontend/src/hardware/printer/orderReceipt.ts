import type { Order, OrderItem } from '@/types'
import { formatCurrency, formatDate, formatPayment, formatUnit } from '@/utils/format'
import type { Receipt, ReceiptBlock } from './receipt'

/** Dados do comércio e rodapé. O sistema não tem cadastro do comércio: ficam na configuração da impressora de cada caixa. */
export interface ReceiptConfig {
  storeName: string
  address: string
  phone: string
  footer: string
}

/** Quantidade como no PDV: kg com 3 casas, inteiros sem casas, fracionados sem zeros à direita. */
export function formatQty(qty: number, unitType: string): string {
  const isKg = unitType === 'kg'
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: isKg ? 3 : 0,
    maximumFractionDigits: isKg || !Number.isInteger(qty) ? 3 : 0,
  }).format(qty)
}

const row = (left: string, right: string): ReceiptBlock => ({ type: 'row', left, right })

function headerBlocks(config: ReceiptConfig): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = []
  if (config.storeName.trim()) {
    blocks.push({ type: 'text', text: config.storeName.trim(), align: 'center', bold: true, size: 'large' })
  }
  for (const line of [config.address, config.phone]) {
    if (line.trim()) blocks.push({ type: 'text', text: line.trim(), align: 'center' })
  }
  if (blocks.length > 0) blocks.push({ type: 'blank' })
  return blocks
}

function footerBlocks(config: ReceiptConfig): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [{ type: 'blank' }]
  if (config.footer.trim()) blocks.push({ type: 'text', text: config.footer.trim(), align: 'center' }, { type: 'blank' })
  blocks.push({ type: 'cut' })
  return blocks
}

function itemBlocks(item: OrderItem): ReceiptBlock[] {
  const code = item.product_code != null ? `${String(item.product_code).padStart(3, '0')} ` : ''
  const quantity = `${formatQty(Number(item.qty), item.unit_type)} ${formatUnit(item.unit_type)} x ${formatCurrency(Number(item.unit_price))}`
  return [
    { type: 'text', text: `${code}${item.product_name}`, bold: true },
    row(quantity, formatCurrency(Number(item.subtotal))),
  ]
}

function paymentLines(order: Order): { type: string; amount: number }[] {
  if (order.payment_splits && order.payment_splits.length > 0) {
    return order.payment_splits.map((split) => ({ type: split.type, amount: Number(split.amount) }))
  }
  return [{ type: order.payment_type, amount: Number(order.total) }]
}

/** Cupom do pedido (comprovante NÃO fiscal). Os valores da API chegam como texto (Decimal), então tudo passa por Number(). */
export function buildOrderReceipt(order: Order, config: ReceiptConfig): Receipt {
  const blocks: ReceiptBlock[] = headerBlocks(config)

  if (order.status === 'cancelled') {
    blocks.push({ type: 'text', text: '*** CANCELADO ***', align: 'center', bold: true, size: 'large' })
  }
  blocks.push({ type: 'text', text: 'CUPOM NÃO FISCAL', align: 'center', bold: true }, { type: 'divider' })

  blocks.push(row('Pedido nº', String(order.order_number)), row('Data', formatDate(order.created_at)), row('Operador', order.created_by_name))
  if (order.customer?.name) blocks.push(row('Cliente', order.customer.name))
  blocks.push({ type: 'divider' })

  for (const item of order.items) blocks.push(...itemBlocks(item))
  blocks.push({ type: 'divider' })

  const discount = Number(order.discount) || 0
  if (discount > 0) {
    const subtotal = order.items.reduce((sum, item) => sum + Number(item.subtotal), 0)
    blocks.push(row('Subtotal', formatCurrency(subtotal)), row('Desconto', `-${formatCurrency(discount)}`))
  }
  blocks.push({ type: 'row', left: 'TOTAL', right: formatCurrency(Number(order.total)), bold: true })

  blocks.push({ type: 'divider' }, { type: 'text', text: 'PAGAMENTO', bold: true })
  for (const payment of paymentLines(order)) blocks.push(row(formatPayment(payment.type), formatCurrency(payment.amount)))

  if (order.notes?.trim()) blocks.push({ type: 'divider' }, { type: 'text', text: `Obs.: ${order.notes.trim()}` })

  blocks.push(...footerBlocks(config))
  return { blocks }
}

/** Página de teste: régua de largura, acentos e um nome longo, para acertar o papel, o driver e a largura do caixa. */
export function buildTestReceipt(config: ReceiptConfig, widthMm: 58 | 80): Receipt {
  const blocks: ReceiptBlock[] = [
    ...headerBlocks(config),
    { type: 'text', text: 'TESTE DE IMPRESSÃO', align: 'center', bold: true },
    { type: 'divider' },
    { type: 'text', text: `Largura configurada: ${widthMm} mm` },
    { type: 'text', text: '1234567890'.repeat(5) },
    { type: 'text', text: 'Acentos: ÁÉÍÓÚ áéíóú ãõç ÂÊÔ' },
    { type: 'divider' },
    { type: 'text', text: 'PRODUTO COM UM NOME MUITO LONGO PARA CONFERIR A QUEBRA DE LINHA NO CUPOM', bold: true },
    row('1,235 kg x R$ 6,99', 'R$ 8,63'),
    { type: 'row', left: 'TOTAL', right: 'R$ 8,63', bold: true },
    ...footerBlocks(config),
  ]
  return { blocks }
}
