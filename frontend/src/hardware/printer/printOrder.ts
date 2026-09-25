import type { Order } from '@/types'
import { buildOrderReceipt, buildTestReceipt, type ReceiptConfig } from './orderReceipt'
import { printHtml } from './print'
import { renderReceiptHtml } from './renderHtml'

export interface PrinterSettings extends ReceiptConfig {
  paperWidthMm: 58 | 80
}

/** Imprimir é sempre um "extra": qualquer falha vira log, nunca uma exceção que derrube a tela ou o registro do pedido. */
function safely(print: () => void): void {
  try {
    print()
  } catch (error) {
    console.error('Falha ao enviar o cupom para a impressora', error)
  }
}

/** Cupom do pedido para a impressora do caixa. Roda depois de o pedido estar salvo: nunca atrasa nem impede o registro. */
export function printOrderReceipt(order: Order, settings: PrinterSettings): void {
  safely(() => printHtml(renderReceiptHtml(buildOrderReceipt(order, settings), { widthMm: settings.paperWidthMm })))
}

/** Página de teste para acertar o papel, o driver e a largura do caixa. */
export function printTestPage(settings: PrinterSettings): void {
  safely(() => printHtml(renderReceiptHtml(buildTestReceipt(settings, settings.paperWidthMm), { widthMm: settings.paperWidthMm })))
}
