import type { Order } from '@/types'
import type { FiscalEnvironment, FiscalIssuer } from '@/types/fiscal'
import { formatCurrency, formatPayment } from '@/utils/format'
import { formatAccessKey } from '@/utils/fiscal'
import { itemBlocks, paymentLines } from './orderReceipt'
import type { Receipt, ReceiptBlock } from './receipt'

/** O que o cupom fiscal precisa além do pedido: a empresa emitente e o ambiente (homologação leva uma marca obrigatória). */
export interface FiscalPrintInfo {
  issuer: FiscalIssuer
  environment: FiscalEnvironment
}

/** Só uma nota autorizada, com chave e QR Code, vira cupom fiscal. Qualquer outro pedido sai como cupom não fiscal. */
export function canPrintFiscal(order: Pick<Order, 'fiscal_status' | 'invoice_key' | 'fiscal_qr_url'>): boolean {
  return order.fiscal_status === 'authorized' && !!order.invoice_key && !!order.fiscal_qr_url
}

export function formatCnpj(digits: string): string {
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

export function formatCpf(digits: string): string {
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
}

/** Data e hora com segundos, como no cupom fiscal ("25/09/2026 12:30:05"). */
export function formatDateTimeSeconds(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(iso)).replace(', ', ' ')
}

const row = (left: string, right: string): ReceiptBlock => ({ type: 'row', left, right })
const center = (text: string, bold = false): ReceiptBlock => ({ type: 'text', text, align: 'center', bold })

function issuerBlocks(issuer: FiscalIssuer): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = []
  if (issuer.legal_name?.trim()) blocks.push({ type: 'text', text: issuer.legal_name.trim(), align: 'center', bold: true, size: 'large' })
  const ids = [issuer.cnpj ? `CNPJ: ${formatCnpj(issuer.cnpj)}` : '', issuer.ie ? `IE: ${issuer.ie}` : ''].filter(Boolean)
  if (ids.length > 0) blocks.push(center(ids.join('  ')))
  const street = [issuer.street, issuer.number].filter((part) => part?.trim()).join(', ')
  const line1 = [street, issuer.district].filter((part) => part?.trim()).join(' - ')
  if (line1) blocks.push(center(line1))
  const cep = issuer.zip_code ? `CEP ${issuer.zip_code.replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : ''
  const line2 = [[issuer.city, issuer.state].filter((part) => part?.trim()).join(' - '), cep].filter(Boolean).join('  ')
  if (line2) blocks.push(center(line2))
  return blocks
}

function consumerLine(order: Order): string {
  const digits = (order.customer?.document ?? '').replace(/\D/g, '')
  if (digits.length === 11) return `CONSUMIDOR CPF: ${formatCpf(digits)}`
  if (digits.length === 14) return `CONSUMIDOR CNPJ: ${formatCnpj(digits)}`
  return 'CONSUMIDOR NÃO IDENTIFICADO'
}

/**
 * Cupom fiscal (DANFE NFC-e) de uma nota AUTORIZADA. Os valores da API chegam como texto (Decimal): tudo passa por Number().
 * Fora deste cupom, por ora: tributos aproximados (Lei 12.741) e o endereço de consulta da SEFAZ, que dependem de
 * dados que o sistema ainda não tem (ver docs/fiscal).
 */
export function buildFiscalReceipt(order: Order, info: FiscalPrintInfo, footer = ''): Receipt {
  const blocks: ReceiptBlock[] = [...issuerBlocks(info.issuer), { type: 'blank' }]

  blocks.push(center('DANFE NFC-e', true), center('Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica'))
  if (info.environment === 'homologacao') {
    blocks.push({ type: 'divider' }, center('EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO', true), center('SEM VALOR FISCAL', true))
  }
  blocks.push({ type: 'divider' })

  for (const item of order.items) blocks.push(...itemBlocks(item))
  blocks.push({ type: 'divider' })

  const subtotal = order.items.reduce((sum, item) => sum + Number(item.subtotal), 0)
  const discount = Number(order.discount) || 0
  blocks.push(row('Qtd. total de itens', String(order.items.length)))
  if (discount > 0) blocks.push(row('Subtotal', formatCurrency(subtotal)), row('Desconto', `-${formatCurrency(discount)}`))
  blocks.push({ type: 'row', left: 'VALOR A PAGAR', right: formatCurrency(Number(order.total)), bold: true })

  blocks.push({ type: 'divider' }, { type: 'text', text: 'FORMA DE PAGAMENTO', bold: true })
  for (const payment of paymentLines(order)) blocks.push(row(formatPayment(payment.type), formatCurrency(payment.amount)))

  blocks.push({ type: 'divider' }, center(consumerLine(order)), { type: 'divider' })

  blocks.push(center(`NFC-e nº ${order.invoice_number ?? ''}  Série ${order.invoice_series ?? ''}`.trim(), true))
  if (order.fiscal_emitted_at) blocks.push(center(`Emissão: ${formatDateTimeSeconds(order.fiscal_emitted_at)}`))
  blocks.push(center('Consulte pela chave de acesso:'), center(formatAccessKey(order.invoice_key)))
  if (order.fiscal_protocol) blocks.push(center(`Protocolo de autorização: ${order.fiscal_protocol}`))

  blocks.push({ type: 'blank' }, { type: 'qrcode', data: order.fiscal_qr_url ?? '' }, { type: 'blank' })
  if (footer.trim()) blocks.push(center(footer.trim()), { type: 'blank' })
  blocks.push({ type: 'cut' })
  return { blocks }
}
